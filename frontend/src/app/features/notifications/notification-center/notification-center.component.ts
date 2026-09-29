import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NotificationService } from '../../../core/services/notification.service';
import { Notification, NotificationType } from '../../../core/models/notification.model';
import { MediaUrlPipe } from '../../../core/pipes/media-url.pipe';

@Component({
  selector: 'app-notification-center',
  standalone: true,
  imports: [CommonModule, MediaUrlPipe],
  templateUrl: './notification-center.component.html',
  styleUrl: './notification-center.component.css',
})
export class NotificationCenterComponent implements OnInit {
  readonly notifService = inject(NotificationService);
  readonly router = inject(Router);

  ngOnInit(): void {
    this.notifService.loadNotifications().subscribe();
  }

  setFilter(filter: string): void {
    this.notifService.activeFilter.set(filter);
  }

  onNotificationClick(notif: Notification): void {
    if (!notif.isRead) {
      this.notifService.markAsRead(notif._id).subscribe();
    }
    if (notif.link) {
      this.router.navigateByUrl(notif.link);
    }
  }

  markAllAsRead(): void {
    this.notifService.markAllAsRead().subscribe();
  }

  deleteNotification(event: Event, notif: Notification): void {
    event.stopPropagation();
    this.notifService.deleteNotification(notif._id).subscribe();
  }

  clearAll(): void {
    if (confirm('Are you sure you want to clear all notifications?')) {
      this.notifService.clearAll().subscribe();
    }
  }
}
