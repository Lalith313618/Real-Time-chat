import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { TaskService } from '../../../core/services/task.service';
import { TeamService } from '../../../core/services/team.service';
import { ChannelService } from '../../../core/services/channel.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  Task,
  TaskStatus,
  TaskPriority,
  CreateTaskDto,
  UpdateTaskDto,
} from '../../../core/models/task.model';
import { Team } from '../../../core/models/team.model';
import { Channel } from '../../../core/models/channel.model';
import { MediaUrlPipe } from '../../../core/pipes/media-url.pipe';

@Component({
  selector: 'app-task-board',
  standalone: true,
  imports: [CommonModule, FormsModule, MediaUrlPipe],
  templateUrl: './task-board.component.html',
  styleUrl: './task-board.component.css',
})
export class TaskBoardComponent implements OnInit, OnDestroy {
  readonly taskService = inject(TaskService);
  readonly teamService = inject(TeamService);
  readonly channelService = inject(ChannelService);
  readonly orgService = inject(OrganizationService);
  readonly authService = inject(AuthService);
  readonly route = inject(ActivatedRoute);

  viewMode = signal<'kanban' | 'list'>('kanban');

  isCreateModalOpen = signal<boolean>(false);
  isDetailDrawerOpen = signal<boolean>(false);
  activeTask = signal<Task | null>(null);
  feedback = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  newTitle = signal<string>('');
  newDescription = signal<string>('');
  newStatus = signal<TaskStatus>('TODO');
  newPriority = signal<TaskPriority>('MEDIUM');
  newDueDate = signal<string>('');
  newTeamId = signal<string>('');
  newChannelId = signal<string>('');
  newAssigneeIds = signal<string[]>([]);
  newChecklistText = signal<string>('');
  newLabelsText = signal<string>('');
  isCreating = signal<boolean>(false);

  newChecklistItemTitle = signal<string>('');

  availableTeams = signal<Team[]>([]);
  availableChannels = signal<Channel[]>([]);

  private subs: Subscription[] = [];

  readonly PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  readonly STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED'];

  readonly orgMembers = computed(() => {
    const org = this.orgService.currentOrganization();
    if (!org || !org.members) return [];
    return org.members
      .filter((m) => m.user && typeof m.user === 'object')
      .map((m) => m.user);
  });

  ngOnInit(): void {
    this.loadTasks();
    this.teamService.loadTeams().subscribe({
      next: (teams: Team[]) => this.availableTeams.set(teams),
    });
    this.subs.push(
      this.route.queryParams.subscribe((params) => {
        if (params['teamId']) {
          this.taskService.teamFilter.set(params['teamId']);
          this.newTeamId.set(params['teamId']);
        }
        if (params['channelId']) {
          this.taskService.channelFilter.set(params['channelId']);
          this.newChannelId.set(params['channelId']);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }

  loadTasks(): void {
    this.taskService.loadTasks().subscribe({
      error: () => this.showFeedback('error', 'Failed to load workplace tasks'),
    });
  }

  onTeamSelectedForCreate(teamId: string): void {
    this.newTeamId.set(teamId);
    this.newChannelId.set('');
    if (teamId) {
      this.channelService.loadTeamChannels(teamId).subscribe({
        next: (chans) => this.availableChannels.set(chans),
      });
    } else {
      this.availableChannels.set([]);
    }
  }

  openCreateModal(defaultStatus: TaskStatus = 'TODO'): void {
    this.newStatus.set(defaultStatus);
    this.newTitle.set('');
    this.newDescription.set('');
    this.newPriority.set('MEDIUM');
    this.newDueDate.set('');
    this.newAssigneeIds.set([]);
    this.newChecklistText.set('');
    this.newLabelsText.set('');
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
  }

  toggleAssigneeSelection(userId: string): void {
    const list = this.newAssigneeIds();
    if (list.includes(userId)) {
      this.newAssigneeIds.set(list.filter((id) => id !== userId));
    } else {
      this.newAssigneeIds.set([...list, userId]);
    }
  }

  createTask(): void {
    const title = this.newTitle().trim();
    if (!title) {
      this.showFeedback('error', 'Please enter a task title');
      return;
    }

    const orgId = this.orgService.currentOrganization()?._id;
    if (!orgId) {
      this.showFeedback('error', 'No active workspace selected');
      return;
    }

    this.isCreating.set(true);
    const checklistItems = this.newChecklistText()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((t) => ({ title: t, isCompleted: false }));

    const labels = this.newLabelsText()
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);

    const dto: CreateTaskDto = {
      title,
      description: this.newDescription().trim(),
      organization: orgId,
      team: this.newTeamId() || null,
      channel: this.newChannelId() || null,
      assignees: this.newAssigneeIds(),
      status: this.newStatus(),
      priority: this.newPriority(),
      dueDate: this.newDueDate() ? new Date(this.newDueDate()).toISOString() : null,
      checklist: checklistItems,
      labels,
    };

    this.taskService.createTask(dto).subscribe({
      next: (task) => {
        this.isCreating.set(false);
        this.closeCreateModal();
        this.showFeedback('success', `Task "${task.title}" created successfully`);
      },
      error: (err) => {
        this.isCreating.set(false);
        this.showFeedback('error', err.error?.message || 'Failed to create task');
      },
    });
  }

  openTaskDetails(task: Task): void {
    this.activeTask.set(task);
    this.isDetailDrawerOpen.set(true);
    this.newChecklistItemTitle.set('');
  }

  closeTaskDetails(): void {
    this.isDetailDrawerOpen.set(false);
    this.activeTask.set(null);
  }

  changeTaskStatus(task: Task, nextStatus: TaskStatus, event?: Event): void {
    if (event) event.stopPropagation();
    if (task.status === nextStatus) return;

    this.taskService.updateTaskStatus(task._id, nextStatus).subscribe({
      next: (updated) => {
        if (this.activeTask()?._id === updated._id) {
          this.activeTask.set(updated);
        }
      },
      error: () => this.showFeedback('error', 'Failed to update task status'),
    });
  }

  changeTaskPriority(task: Task, priority: TaskPriority): void {
    if (task.priority === priority) return;
    this.taskService.updateTask(task._id, { priority }).subscribe({
      next: (updated) => {
        if (this.activeTask()?._id === updated._id) {
          this.activeTask.set(updated);
        }
      },
      error: () => this.showFeedback('error', 'Failed to update priority'),
    });
  }

  toggleChecklist(task: Task, itemId?: string, event?: Event): void {
    if (event) event.stopPropagation();
    if (!itemId) return;

    this.taskService.toggleChecklistItem(task._id, itemId).subscribe({
      next: (updated) => {
        if (this.activeTask()?._id === updated._id) {
          this.activeTask.set(updated);
        }
      },
      error: () => this.showFeedback('error', 'Failed to update checklist'),
    });
  }

  addChecklistItem(task: Task): void {
    const title = this.newChecklistItemTitle().trim();
    if (!title) return;

    this.taskService.addChecklistItem(task._id, title).subscribe({
      next: (updated) => {
        this.newChecklistItemTitle.set('');
        if (this.activeTask()?._id === updated._id) {
          this.activeTask.set(updated);
        }
      },
      error: () => this.showFeedback('error', 'Failed to add checklist item'),
    });
  }

  deleteTask(task: Task): void {
    if (!confirm(`Are you sure you want to delete task "${task.title}"?`)) return;

    this.taskService.deleteTask(task._id).subscribe({
      next: () => {
        this.closeTaskDetails();
        this.showFeedback('success', 'Task deleted');
      },
      error: () => this.showFeedback('error', 'Failed to delete task'),
    });
  }

  getStatusLabel(status: TaskStatus): string {
    switch (status) {
      case 'TODO': return 'To Do';
      case 'IN_PROGRESS': return 'In Progress';
      case 'IN_REVIEW': return 'In Review';
      case 'COMPLETED': return 'Completed';
    }
  }

  getCompletedChecklistCount(task: Task): number {
    if (!task.checklist) return 0;
    return task.checklist.filter((i) => i.isCompleted).length;
  }

  isOverdue(dueDate?: string | Date | null): boolean {
    if (!dueDate) return false;
    return new Date(dueDate).getTime() < Date.now();
  }

  showFeedback(type: 'success' | 'error', text: string): void {
    this.feedback.set({ type, text });
    setTimeout(() => {
      if (this.feedback()?.text === text) {
        this.feedback.set(null);
      }
    }, 4000);
  }
}
