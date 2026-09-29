import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Notification, NotificationType } from '../models/notification.model';
import { SocketService } from './socket.service';
import { resolveMediaUrl } from '../utils/media-url.util';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly socketService = inject(SocketService);
  private readonly apiUrl = `${environment.apiUrl}/notifications`;

  readonly notifications = signal<Notification[]>([]);
  readonly unreadCount = signal<number>(0);
  readonly isLoading = signal<boolean>(false);
  readonly activeFilter = signal<string>('all');
  readonly isDropdownOpen = signal<boolean>(false);
  readonly activeToast = signal<Notification | null>(null);
  private toastTimeout: any = null;

  readonly filteredNotifications = computed(() => {
    const list = this.notifications();
    const f = this.activeFilter();

    if (f === 'all') return list;
    if (f === 'unread') return list.filter((n) => !n.isRead);
    if (f === 'TASK') return list.filter((n) => n.type === 'TASK_ASSIGNED' || n.type === 'TASK_STATUS');
    return list.filter((n) => n.type === f);
  });

  constructor() {
    this.initSocketListeners();
    this.fetchInitialUnreadCount();
  }

  private normalizeNotification(n: Notification): Notification {
    if (!n) return n;
    return {
      ...n,
      sender: n.sender && typeof n.sender === 'object'
        ? {
            ...n.sender,
            profileImage: n.sender.profileImage ? resolveMediaUrl(n.sender.profileImage) : '',
          }
        : n.sender,
    };
  }

  private initSocketListeners(): void {
   
    this.socketService.onNewNotification().subscribe((data) => {
      if (data?.notification) {
        const normalized = this.normalizeNotification(data.notification);
        this.notifications.update((list) => [normalized, ...list]);
        this.unreadCount.update((count) => count + 1);
        this.showToast(normalized);
      }
    });
    this.socketService.onUnreadNotificationCount().subscribe((data) => {
      if (data?.unreadCount !== undefined) {
        this.unreadCount.set(data.unreadCount);
      }
    });
  }

  fetchInitialUnreadCount(): void {
    this.http
      .get<{ status: string; unreadCount: number }>(`${this.apiUrl}/unread-count`)
      .subscribe({
        next: (res) => this.unreadCount.set(res.unreadCount || 0),
        error: () => {},
      });
  }

  loadNotifications(params: { unreadOnly?: boolean; type?: string; page?: number; limit?: number } = {}): Observable<Notification[]> {
    this.isLoading.set(true);
    let httpParams = new HttpParams();

    if (params.unreadOnly) httpParams = httpParams.set('unreadOnly', 'true');
    if (params.type && params.type !== 'all') httpParams = httpParams.set('type', params.type);
    if (params.page) httpParams = httpParams.set('page', params.page.toString());
    if (params.limit) httpParams = httpParams.set('limit', params.limit.toString());

    return this.http
      .get<{ status: string; results: number; unreadCount: number; notifications: Notification[] }>(this.apiUrl, {
        params: httpParams,
      })
      .pipe(
        map((res) => {
          this.unreadCount.set(res.unreadCount || 0);
          return (res.notifications || []).map((n) => this.normalizeNotification(n));
        }),
        tap((list) => {
          this.notifications.set(list);
          this.isLoading.set(false);
        })
      );
  }

  markAsRead(id: string): Observable<Notification> {
    return this.http
      .patch<{ status: string; notification: Notification; unreadCount: number }>(
        `${this.apiUrl}/${id}/read`,
        {}
      )
      .pipe(
        map((res) => this.normalizeNotification(res.notification)),
        tap((updated) => {
          this.notifications.update((list) =>
            list.map((n) => (n._id === updated._id ? { ...n, isRead: true, readAt: new Date() } : n))
          );
          this.unreadCount.update((c) => Math.max(0, c - 1));
        })
      );
  }

  markAllAsRead(): Observable<any> {
    return this.http
      .patch<{ status: string; modifiedCount: number; unreadCount: number }>(
        `${this.apiUrl}/read-all`,
        {}
      )
      .pipe(
        tap(() => {
          this.notifications.update((list) =>
            list.map((n) => ({ ...n, isRead: true, readAt: new Date() }))
          );
          this.unreadCount.set(0);
        })
      );
  }

  deleteNotification(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`).pipe(
      tap(() => {
        const deleted = this.notifications().find((n) => n._id === id);
        this.notifications.update((list) => list.filter((n) => n._id !== id));
        if (deleted && !deleted.isRead) {
          this.unreadCount.update((c) => Math.max(0, c - 1));
        }
      })
    );
  }

  clearAll(): Observable<any> {
    return this.http.delete(`${this.apiUrl}/clear-all`).pipe(
      tap(() => {
        this.notifications.set([]);
        this.unreadCount.set(0);
      })
    );
  }

  toggleDropdown(): void {
    const next = !this.isDropdownOpen();
    this.isDropdownOpen.set(next);
    if (next && this.notifications().length === 0) {
      this.loadNotifications().subscribe();
    }
  }

  closeDropdown(): void {
    this.isDropdownOpen.set(false);
  }

  showToast(notif: Notification): void {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.activeToast.set(notif);
    this.toastTimeout = setTimeout(() => {
      if (this.activeToast()?._id === notif._id) {
        this.activeToast.set(null);
      }
    }, 6000);
  }

  dismissToast(): void {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.activeToast.set(null);
  }

  getNotificationIcon(type: NotificationType): string {
    switch (type) {
      case 'MENTION': return '📣';
      case 'TASK_ASSIGNED': return '📋';
      case 'TASK_STATUS': return '⚡';
      case 'REPLY': return '💬';
      case 'REACTION': return '😀';
      case 'TEAM_INVITE': return '👥';
      case 'CHANNEL_INVITE': return '🔒';
      default: return '🔔';
    }
  }
}
