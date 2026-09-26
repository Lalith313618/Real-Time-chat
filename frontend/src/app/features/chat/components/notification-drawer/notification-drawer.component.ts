import { Component, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService, NotificationItem } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-notification-drawer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-drawer.component.html',
  styleUrl: './notification-drawer.component.css'
})
export class NotificationDrawerComponent {
  readonly notificationService = inject(NotificationService);

  @Output() itemClick = new EventEmitter<NotificationItem>();

  onItemClick(item: NotificationItem): void {
    this.itemClick.emit(item);
  }
}
