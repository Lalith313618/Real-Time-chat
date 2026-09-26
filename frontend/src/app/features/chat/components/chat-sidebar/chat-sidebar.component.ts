import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Conversation } from '../../../../core/models/conversation.model';
import { User } from '../../../../core/models/user.model';
import { AuthService } from '../../../../core/services/auth.service';
import { ConversationService } from '../../../../core/services/conversation.service';
import { SocketService } from '../../../../core/services/socket.service';

@Component({
  selector: 'app-chat-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './chat-sidebar.component.html',
  styleUrl: './chat-sidebar.component.css'
})
export class ChatSidebarComponent {
  readonly authService = inject(AuthService);
  readonly conversationService = inject(ConversationService);
  readonly socketService = inject(SocketService);

  @Input() conversations: Conversation[] = [];
  @Input() activeConversation: Conversation | null = null;
  @Input() conversationFilter = '';
  @Input() isLoadingConversations = false;

  @Output() selectConversation = new EventEmitter<Conversation>();
  @Output() filterChange = new EventEmitter<string>();
  @Output() openCreateGroup = new EventEmitter<void>();

  get filteredConversations(): Conversation[] {
    const filter = this.conversationFilter.trim().toLowerCase();
    if (!filter) return this.conversations;

    return this.conversations.filter((c) => {
      if (c.isGroup) {
        return c.groupName?.toLowerCase().includes(filter);
      }
      const other = this.getOtherParticipant(c);
      return other?.name.toLowerCase().includes(filter) || other?.email.toLowerCase().includes(filter);
    });
  }

  getOtherParticipant(conv: Conversation): User | null {
    const currentId = this.authService.currentUser()?._id;
    if (!conv || !conv.participants || !currentId) return null;
    return this.conversationService.getOtherParticipant(conv, currentId);
  }

  isParticipantOnline(user: User | null | undefined): boolean {
    if (!user || !user._id) return false;
    return this.socketService.isUserOnline(user._id);
  }

  onSelect(conv: Conversation): void {
    this.selectConversation.emit(conv);
  }

  onFilterChange(val: string): void {
    this.filterChange.emit(val);
  }

  onOpenCreateGroup(): void {
    this.openCreateGroup.emit();
  }
}
