import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-global-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './global-toast.component.html',
  styleUrl: './global-toast.component.css'
})
export class GlobalToastComponent {
  readonly notificationService = inject(NotificationService);
}
