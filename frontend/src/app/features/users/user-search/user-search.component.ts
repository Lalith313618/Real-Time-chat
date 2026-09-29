import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { UserService } from '../../../core/services/user.service';
import { ConversationService } from '../../../core/services/conversation.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { AuthService } from '../../../core/services/auth.service';
import { User } from '../../../core/models/user.model';
import { MediaUrlPipe } from '../../../core/pipes/media-url.pipe';

@Component({
  selector: 'app-user-search',
  standalone: true,
  imports: [CommonModule, FormsModule, MediaUrlPipe],
  templateUrl: './user-search.component.html',
  styleUrl: './user-search.component.css',
})
export class UserSearchComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);
  readonly conversationService = inject(ConversationService);
  readonly orgService = inject(OrganizationService);
  readonly authService = inject(AuthService);

  // Search & Filter state
  searchQuery = signal<string>('');
  selectedDepartment = signal<string>('ALL');
  selectedPresence = signal<string>('ALL');
  viewMode = signal<'grid' | 'table'>('grid');

  // Data state
  departments = signal<string[]>([]);
  directoryUsers = signal<User[]>([]);
  isLoading = signal<boolean>(false);

  // Profile Drawer / Modal state
  selectedUser = signal<User | null>(null);
  showProfileModal = signal<boolean>(false);
  isCreatingChat = signal<boolean>(false);

  private searchSubject = new Subject<string>();

  ngOnInit(): void {
    this.loadDepartments();
    this.loadDirectory();

    // Debounced live search
    this.searchSubject
      .pipe(debounceTime(250), distinctUntilChanged())
      .subscribe(() => {
        this.loadDirectory();
      });
  }

  loadDepartments(): void {
    this.userService.getDepartments().subscribe({
      next: (depts) => {
        this.departments.set(depts);
      },
    });
  }

  loadDirectory(): void {
    this.isLoading.set(true);
    const orgId = this.orgService.currentOrganization()?._id;

    this.userService
      .getUserDirectory({
        q: this.searchQuery().trim(),
        department: this.selectedDepartment(),
        presence: this.selectedPresence(),
        orgId,
      })
      .subscribe({
        next: (users) => {
          this.directoryUsers.set(users);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('[User Directory Load Error]:', err);
          this.isLoading.set(false);
        },
      });
  }

  onSearchChange(term: string): void {
    this.searchQuery.set(term);
    this.searchSubject.next(term);
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.selectedDepartment.set('ALL');
    this.selectedPresence.set('ALL');
    this.loadDirectory();
  }

  setDepartment(dept: string): void {
    this.selectedDepartment.set(dept);
    this.loadDirectory();
  }

  setPresence(presence: string): void {
    this.selectedPresence.set(presence);
    this.loadDirectory();
  }

  viewProfile(user: User): void {
    this.selectedUser.set(user);
    this.showProfileModal.set(true);
  }

  closeProfileModal(): void {
    this.showProfileModal.set(false);
    this.selectedUser.set(null);
  }

  startConversation(user: User): void {
    this.isCreatingChat.set(true);

    this.conversationService.getOrCreateConversation(user._id).subscribe({
      next: (conversation) => {
        this.isCreatingChat.set(false);
        this.closeProfileModal();
        this.router.navigate(['/chat', conversation._id]);
      },
      error: (err) => {
        this.isCreatingChat.set(false);
        console.error('Failed to initiate conversation:', err);
      },
    });
  }
}
