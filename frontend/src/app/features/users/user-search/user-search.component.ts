import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of } from 'rxjs';
import { UserService } from '../../../core/services/user.service';
import { ConversationService } from '../../../core/services/conversation.service';
import { User } from '../../../core/models/user.model';
import { Conversation } from '../../../core/models/conversation.model';

@Component({
  selector: 'app-user-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-search.component.html',
  styleUrl: './user-search.component.css'
})
export class UserSearchComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);
  readonly conversationService = inject(ConversationService);

  searchQuery = signal<string>('');
  isLoading = signal<boolean>(false);
  searchResults = signal<User[]>([]);
  allUsers = signal<User[]>([]);
  selectedUser = signal<User | null>(null);
  showProfileModal = signal<boolean>(false);

  // Conversation creation notification
  conversationSuccess = signal<{ message: string; conversation: Conversation } | null>(null);
  isCreatingChat = signal<boolean>(false);

  private searchSubject = new Subject<string>();

  ngOnInit(): void {
    // Load initial user directory
    this.loadAllUsers();

    // Debounced search stream
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => {
          if (!query.trim()) {
            this.isLoading.set(false);
            return of([]);
          }
          this.isLoading.set(true);
          return this.userService.searchUsers(query);
        })
      )
      .subscribe({
        next: (users) => {
          this.searchResults.set(users);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Search error:', err);
          this.isLoading.set(false);
        }
      });
  }

  loadAllUsers(): void {
    this.isLoading.set(true);
    this.userService.getAllUsers().subscribe({
      next: (users) => {
        this.allUsers.set(users);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load users:', err);
        this.isLoading.set(false);
      }
    });
  }

  onSearchChange(term: string): void {
    this.searchQuery.set(term);
    this.searchSubject.next(term);
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
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
    this.conversationSuccess.set(null);

    this.conversationService.getOrCreateConversation(user._id).subscribe({
      next: (conversation) => {
        this.isCreatingChat.set(false);
        this.router.navigate(['/chat', conversation._id]);
      },
      error: (err) => {
        this.isCreatingChat.set(false);
        console.error('Failed to initiate conversation:', err);
      }
    });
  }
}
