import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../core/services/user.service';
import { User } from '../../../core/models/user.model';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-profile.component.html',
  styleUrl: './user-profile.component.css'
})
export class UserProfileComponent implements OnInit {
  readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);

  user = signal<User | null>(null);
  nameInput = signal<string>('');
  imageUrlInput = signal<string>('');
  
  isSaving = signal<boolean>(false);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  // Preset avatar choices
  presetAvatars = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150',
    'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150'
  ];

  ngOnInit(): void {
    const current = this.authService.currentUser();
    if (current) {
      this.user.set(current);
      this.nameInput.set(current.name);
      this.imageUrlInput.set(current.profileImage || '');
    }
  }

  selectAvatar(url: string): void {
    this.imageUrlInput.set(url);
  }

  clearAvatar(): void {
    this.imageUrlInput.set('');
  }

  onSave(): void {
    if (!this.nameInput().trim()) {
      this.errorMessage.set('Name cannot be empty');
      return;
    }

    this.isSaving.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    this.userService
      .updateProfile({
        name: this.nameInput().trim(),
        profileImage: this.imageUrlInput().trim()
      })
      .subscribe({
        next: (updatedUser) => {
          this.user.set(updatedUser);
          this.authService.currentUser.set(updatedUser);
          localStorage.setItem('user', JSON.stringify(updatedUser));
          this.isSaving.set(false);
          this.successMessage.set('Profile updated successfully!');
          setTimeout(() => this.successMessage.set(null), 4000);
        },
        error: (err) => {
          this.isSaving.set(false);
          this.errorMessage.set(err?.message || 'Failed to update profile');
        }
      });
  }
}
