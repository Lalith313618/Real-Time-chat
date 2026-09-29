import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Task,
  TaskStatus,
  TaskPriority,
  CreateTaskDto,
  UpdateTaskDto,
} from '../models/task.model';
import { SocketService } from './socket.service';
import { AuthService } from './auth.service';
import { resolveMediaUrl } from '../utils/media-url.util';

@Injectable({
  providedIn: 'root',
})
export class TaskService {
  private readonly http = inject(HttpClient);
  private readonly socketService = inject(SocketService);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = `${environment.apiUrl}/tasks`;

  readonly tasks = signal<Task[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly selectedTask = signal<Task | null>(null);
  readonly activeStatusFilter = signal<string>('all'); 
  readonly priorityFilter = signal<string>('all');
  readonly teamFilter = signal<string>('all');
  readonly channelFilter = signal<string>('all');
  readonly searchQuery = signal<string>('');
  readonly myTasks = computed(() => {
    const myId = this.authService.currentUser()?._id;
    if (!myId) return [];
    return this.tasks().filter((t) => t.assignees?.some((a) => a._id === myId));
  });

  readonly filteredTasks = computed(() => {
    let list = this.tasks();
    const myId = this.authService.currentUser()?._id;

    const statusF = this.activeStatusFilter();
    if (statusF === 'my') {
      list = list.filter((t) => t.assignees?.some((a) => a._id === myId));
    } else if (statusF !== 'all') {
      list = list.filter((t) => t.status === statusF);
    }
    const prioF = this.priorityFilter();
    if (prioF !== 'all') {
      list = list.filter((t) => t.priority === prioF);
    }
    const teamF = this.teamFilter();
    if (teamF !== 'all') {
      list = list.filter((t) => {
        const tId = typeof t.team === 'object' && t.team ? t.team._id : t.team;
        return tId === teamF;
      });
    }
    const chanF = this.channelFilter();
    if (chanF !== 'all') {
      list = list.filter((t) => {
        const cId = typeof t.channel === 'object' && t.channel ? t.channel._id : t.channel;
        return cId === chanF;
      });
    }
    const query = this.searchQuery().trim().toLowerCase();
    if (query) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          (t.description && t.description.toLowerCase().includes(query)) ||
          t.labels?.some((l) => l.toLowerCase().includes(query))
      );
    }

    return list;
  });

  readonly todoTasks = computed(() =>
    this.filteredTasks().filter((t) => t.status === 'TODO')
  );

  readonly inProgressTasks = computed(() =>
    this.filteredTasks().filter((t) => t.status === 'IN_PROGRESS')
  );

  readonly inReviewTasks = computed(() =>
    this.filteredTasks().filter((t) => t.status === 'IN_REVIEW')
  );

  readonly completedTasks = computed(() =>
    this.filteredTasks().filter((t) => t.status === 'COMPLETED')
  );

  constructor() {
    this.initSocketListeners();
  }

  private normalizeTask(task: Task): Task {
    if (!task) return task;
    return {
      ...task,
      creator: task.creator
        ? {
            ...task.creator,
            profileImage: task.creator.profileImage
              ? resolveMediaUrl(task.creator.profileImage)
              : '',
          }
        : task.creator,
      assignees: (task.assignees || []).map((a) => ({
        ...a,
        profileImage: a.profileImage ? resolveMediaUrl(a.profileImage) : '',
      })),
    };
  }

  private initSocketListeners(): void {
    this.socketService.onTaskCreated().subscribe((data) => {
      if (data?.task) {
        const normalized = this.normalizeTask(data.task);
        this.tasks.update((list) => {
          if (list.some((t) => t._id === normalized._id)) {
            return list.map((t) => (t._id === normalized._id ? normalized : t));
          }
          return [normalized, ...list];
        });
      }
    });

    this.socketService.onTaskUpdated().subscribe((data) => {
      if (data?.task) {
        const normalized = this.normalizeTask(data.task);
        this.tasks.update((list) =>
          list.map((t) => (t._id === normalized._id ? normalized : t))
        );
        if (this.selectedTask()?._id === normalized._id) {
          this.selectedTask.set(normalized);
        }
      }
    });

    this.socketService.onTaskStatusChanged().subscribe((data) => {
      if (data?.task) {
        const normalized = this.normalizeTask(data.task);
        this.tasks.update((list) =>
          list.map((t) => (t._id === normalized._id ? normalized : t))
        );
        if (this.selectedTask()?._id === normalized._id) {
          this.selectedTask.set(normalized);
        }
      }
    });

    this.socketService.onTaskDeleted().subscribe((data) => {
      if (data?.taskId) {
        this.tasks.update((list) => list.filter((t) => t._id !== data.taskId));
        if (this.selectedTask()?._id === data.taskId) {
          this.selectedTask.set(null);
        }
      }
    });
  }

  loadTasks(params: {
    team?: string;
    channel?: string;
    status?: string;
    priority?: string;
    myTasks?: boolean;
    q?: string;
    organization?: string;
  } = {}): Observable<Task[]> {
    this.isLoading.set(true);
    let httpParams = new HttpParams();

    if (params.team) httpParams = httpParams.set('team', params.team);
    if (params.channel) httpParams = httpParams.set('channel', params.channel);
    if (params.status && params.status !== 'all') httpParams = httpParams.set('status', params.status);
    if (params.priority && params.priority !== 'all') httpParams = httpParams.set('priority', params.priority);
    if (params.myTasks) httpParams = httpParams.set('myTasks', 'true');
    if (params.q) httpParams = httpParams.set('q', params.q);
    if (params.organization) httpParams = httpParams.set('organization', params.organization);

    return this.http
      .get<{ status: string; results: number; tasks: Task[] }>(this.apiUrl, {
        params: httpParams,
      })
      .pipe(
        map((res) => (res.tasks || []).map((t) => this.normalizeTask(t))),
        tap((tasks) => {
          this.tasks.set(tasks);
          this.isLoading.set(false);
        })
      );
  }

  getTaskById(id: string): Observable<Task> {
    return this.http
      .get<{ status: string; task: Task }>(`${this.apiUrl}/${id}`)
      .pipe(
        map((res) => this.normalizeTask(res.task)),
        tap((task) => this.selectedTask.set(task))
      );
  }

  createTask(dto: CreateTaskDto): Observable<Task> {
    return this.http
      .post<{ status: string; task: Task }>(this.apiUrl, dto)
      .pipe(
        map((res) => this.normalizeTask(res.task)),
        tap((created) => {
          this.tasks.update((list) => {
            if (list.some((t) => t._id === created._id)) return list;
            return [created, ...list];
          });
        })
      );
  }

  updateTask(id: string, dto: UpdateTaskDto): Observable<Task> {
    return this.http
      .put<{ status: string; task: Task }>(`${this.apiUrl}/${id}`, dto)
      .pipe(
        map((res) => this.normalizeTask(res.task)),
        tap((updated) => {
          this.tasks.update((list) =>
            list.map((t) => (t._id === updated._id ? updated : t))
          );
          if (this.selectedTask()?._id === updated._id) {
            this.selectedTask.set(updated);
          }
        })
      );
  }

  updateTaskStatus(id: string, status: TaskStatus): Observable<Task> {
    return this.http
      .patch<{ status: string; task: Task }>(`${this.apiUrl}/${id}/status`, { status })
      .pipe(
        map((res) => this.normalizeTask(res.task)),
        tap((updated) => {
          this.tasks.update((list) =>
            list.map((t) => (t._id === updated._id ? updated : t))
          );
          if (this.selectedTask()?._id === updated._id) {
            this.selectedTask.set(updated);
          }
        })
      );
  }

  addChecklistItem(id: string, title: string): Observable<Task> {
    return this.http
      .post<{ status: string; task: Task }>(`${this.apiUrl}/${id}/checklist`, { title })
      .pipe(
        map((res) => this.normalizeTask(res.task)),
        tap((updated) => {
          this.tasks.update((list) =>
            list.map((t) => (t._id === updated._id ? updated : t))
          );
          if (this.selectedTask()?._id === updated._id) {
            this.selectedTask.set(updated);
          }
        })
      );
  }

  toggleChecklistItem(id: string, itemId: string): Observable<Task> {
    return this.http
      .patch<{ status: string; task: Task }>(`${this.apiUrl}/${id}/checklist/${itemId}`, {})
      .pipe(
        map((res) => this.normalizeTask(res.task)),
        tap((updated) => {
          this.tasks.update((list) =>
            list.map((t) => (t._id === updated._id ? updated : t))
          );
          if (this.selectedTask()?._id === updated._id) {
            this.selectedTask.set(updated);
          }
        })
      );
  }

  deleteTask(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`).pipe(
      tap(() => {
        this.tasks.update((list) => list.filter((t) => t._id !== id));
        if (this.selectedTask()?._id === id) {
          this.selectedTask.set(null);
        }
      })
    );
  }
}
