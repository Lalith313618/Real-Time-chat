import { Component, Input, Output, EventEmitter, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { User } from '../../../../core/models/user.model';
import { MediaUrlPipe } from '../../../../core/pipes/media-url.pipe';

@Component({
  selector: 'app-create-group-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, MediaUrlPipe],
  templateUrl: './create-group-modal.component.html',
  styleUrl: './create-group-modal.component.css'
})
export class CreateGroupModalComponent {
  @Input() isOpen = false;
  @Input() newGroupName = '';
  @Input() selectedGroupMembers: string[] = [];
  @Input() usersList: User[] = [];
  @Input() isCreatingGroup = false;
  @Input() createGroupError = '';
  @Input() userFilter = '';

  @Output() nameChange = new EventEmitter<string>();
  @Output() filterChange = new EventEmitter<string>();
  @Output() memberToggle = new EventEmitter<string>();
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<void>();

  get filteredUsers(): User[] {
    const q = this.userFilter.trim().toLowerCase();
    if (!q) return this.usersList;
    return this.usersList.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }

  isMemberSelected(userId: string): boolean {
    return this.selectedGroupMembers.includes(userId);
  }

  onNameChange(val: string): void {
    this.nameChange.emit(val);
  }

  onFilterChange(val: string): void {
    this.filterChange.emit(val);
  }

  onToggleMember(userId: string): void {
    this.memberToggle.emit(userId);
  }

  onClose(): void {
    this.close.emit();
  }

  onSubmit(): void {
    this.submit.emit();
  }
}
