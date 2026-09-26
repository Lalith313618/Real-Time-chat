import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationService, NotificationTone } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-notification-settings-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './notification-settings-modal.component.html',
  styleUrl: './notification-settings-modal.component.css'
})
export class NotificationSettingsModalComponent {
  readonly notificationService = inject(NotificationService);

  updateToneSetting(tone: NotificationTone): void {
    this.notificationService.updateSettings({ soundTone: tone });
    this.notificationService.testSound(tone);
  }

  updateVolumeSetting(event: Event): void {
    const val = Number((event.target as HTMLInputElement).value);
    this.notificationService.updateSettings({ volume: val });
  }

  onClose(): void {
    this.notificationService.toggleSettingsModal(false);
  }
}
