import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Conversation } from '../../../../core/models/conversation.model';
import { User } from '../../../../core/models/user.model';
import { AuthService } from '../../../../core/services/auth.service';
import { ConversationService } from '../../../../core/services/conversation.service';
import { SocketService } from '../../../../core/services/socket.service';
import { MediaUrlPipe } from '../../../../core/pipes/media-url.pipe';

@Component({
  selector: 'app-chat-header',
  standalone: true,
  imports: [CommonModule, MediaUrlPipe],
  templateUrl: './chat-header.component.html',
  styleUrl: './chat-header.component.css'
})
export class ChatHeaderComponent {
  readonly authService = inject(AuthService);
  readonly conversationService = inject(ConversationService);
  readonly socketService = inject(SocketService);

  recipientAvatarError = false;

  @Input() activeConversation: Conversation | null = null;
  @Input() typingIndicatorText = '';
  @Input() isSearchOpen = false;
  @Input() isGroupInfoOpen = false;
  @Input() isUserProfileOpen = false;
  @Input() lastSeenMap: Record<string, string | Date> = {};

  @Output() back = new EventEmitter<void>();
  @Output() openGroupInfo = new EventEmitter<void>();
  @Output() openUserProfile = new EventEmitter<void>();
  @Output() toggleSearch = new EventEmitter<void>();
  @Output() clearChat = new EventEmitter<void>();

  getOtherParticipant(conv: Conversation | null): User | null {
    if (!conv) return null;
    const currentId = this.authService.currentUser()?._id;
    if (!conv.participants || !currentId) return null;
    return this.conversationService.getOtherParticipant(conv, currentId);
  }

  isParticipantOnline(user: User | null | undefined): boolean {
    if (!user || !user._id) return false;
    return this.socketService.isUserOnline(user._id);
  }

  getParticipantLastSeen(user: User | null | undefined): string | Date | undefined {
    if (!user || !user._id) return undefined;
    return this.lastSeenMap[user._id] || user.lastSeen;
  }

  formatLastSeen(dateVal: string | Date | undefined): string {
    if (!dateVal) return 'Offline';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 'Offline';

    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'Last seen just now';
    if (diffMins < 60) return `Last seen ${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Last seen ${diffHours}h ago`;
    return `Last seen ${d.toLocaleDateString()}`;
  }

  isCurrentUserAdmin(conv: Conversation | null): boolean {
    if (!conv || !conv.groupAdmin) return false;
    const currentUserId = this.authService.currentUser()?._id;
    if (!currentUserId) return false;
    return conv.groupAdmin.some((admin: any) => {
      const id = typeof admin === 'string' ? admin : admin._id;
      return id === currentUserId;
    });
  }

  onBack(): void {
    this.back.emit();
  }

  onOpenGroupInfo(): void {
    this.openGroupInfo.emit();
  }

  onOpenUserProfile(): void {
    this.openUserProfile.emit();
  }

  onToggleSearch(): void {
    this.toggleSearch.emit();
  }
}
