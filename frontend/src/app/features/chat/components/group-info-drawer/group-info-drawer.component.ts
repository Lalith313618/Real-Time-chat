import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Conversation } from '../../../../core/models/conversation.model';
import { User } from '../../../../core/models/user.model';
import { AuthService } from '../../../../core/services/auth.service';

import { SocketService } from '../../../../core/services/socket.service';
import { MediaUrlPipe } from '../../../../core/pipes/media-url.pipe';

@Component({
  selector: 'app-group-info-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule, MediaUrlPipe],
  templateUrl: './group-info-drawer.component.html',
  styleUrl: './group-info-drawer.component.css'
})
export class GroupInfoDrawerComponent {
  readonly authService = inject(AuthService);
  readonly socketService = inject(SocketService);

  @Input() isOpen = false;
  @Input() conversation: Conversation | null = null;
  @Input() groupActionMessage = '';
  @Input() groupActionLoading = false;
  @Input() availableUsers: User[] = [];

  @Output() close = new EventEmitter<void>();
  @Output() rename = new EventEmitter<string>();
  @Output() addMember = new EventEmitter<User>();
  @Output() toggleAdmin = new EventEmitter<User>();
  @Output() removeMember = new EventEmitter<User>();
  @Output() leaveGroup = new EventEmitter<void>();

  isEditingGroupName = false;
  editGroupNameInput = '';
  isAddingMemberOpen = false;
  memberToAddSearch = '';

  isCurrentUserAdmin(conv: Conversation | null): boolean {
    if (!conv || !conv.groupAdmin) return false;
    const currentUserId = this.authService.currentUser()?._id;
    if (!currentUserId) return false;
    return conv.groupAdmin.some((admin: any) => {
      const id = typeof admin === 'string' ? admin : admin._id;
      return id === currentUserId;
    });
  }

  isUserAdmin(userId: string, conv: Conversation | null): boolean {
    if (!conv || !conv.groupAdmin) return false;
    return conv.groupAdmin.some((admin: any) => {
      const id = typeof admin === 'string' ? admin : admin._id;
      return id === userId;
    });
  }

  isParticipantOnline(user: User): boolean {
    return this.socketService.isUserOnline(user._id);
  }

  get filteredAvailableUsers(): User[] {
    const q = this.memberToAddSearch.trim().toLowerCase();
    if (!q) return this.availableUsers;
    return this.availableUsers.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }

  startEditingName(): void {
    this.editGroupNameInput = this.conversation?.groupName || '';
    this.isEditingGroupName = true;
  }

  cancelEditingName(): void {
    this.isEditingGroupName = false;
  }

  saveGroupName(): void {
    if (this.editGroupNameInput.trim()) {
      this.rename.emit(this.editGroupNameInput.trim());
      this.isEditingGroupName = false;
    }
  }

  onAddMember(user: User): void {
    this.addMember.emit(user);
    this.memberToAddSearch = '';
  }

  onToggleAdmin(user: User): void {
    this.toggleAdmin.emit(user);
  }

  onRemoveMember(user: User): void {
    this.removeMember.emit(user);
  }

  onLeaveGroup(): void {
    this.leaveGroup.emit();
  }

  onClose(): void {
    this.close.emit();
  }
}
