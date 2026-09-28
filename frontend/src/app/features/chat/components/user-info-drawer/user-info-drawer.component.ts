import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { User } from '../../../../core/models/user.model';
import { MediaUrlPipe } from '../../../../core/pipes/media-url.pipe';

@Component({
  selector: 'app-user-info-drawer',
  standalone: true,
  imports: [CommonModule, MediaUrlPipe],
  templateUrl: './user-info-drawer.component.html',
  styleUrl: './user-info-drawer.component.css'
})
export class UserInfoDrawerComponent {
  @Input() isOpen = false;
  @Input() user: User | null = null;
  @Input() isOnline = false;
  @Input() lastSeen?: string | Date;

  @Output() close = new EventEmitter<void>();
  @Output() startSearch = new EventEmitter<void>();
  @Output() clearChat = new EventEmitter<void>();

  avatarError = false;

  handleAvatarError(): void {
    this.avatarError = true;
  }

  onClose(): void {
    this.close.emit();
  }

  onStartSearch(): void {
    this.startSearch.emit();
    this.close.emit();
  }

  onClearChat(): void {
    this.clearChat.emit();
    this.close.emit();
  }

  formatLastSeen(date?: string | Date): string {
    if (!date) return 'Recently';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'Recently';
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return `today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
}
