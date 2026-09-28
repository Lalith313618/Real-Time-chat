import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { User } from '../models/user.model';
import { SocketService } from './socket.service';
import { resolveMediaUrl } from '../utils/media-url.util';

export interface AuthResponse {
  status: string;
  message?: string;
  token: string;
  user: User;
}

export interface RegisterDto {
  name: string;
  email: string;
  password: string;
  profileImage?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly socketService = inject(SocketService);
  private readonly apiUrl = `${environment.apiUrl}/auth`;

  // Reactive state signals
  readonly currentUser = signal<User | null>(this.getStoredUser());
  readonly isLoggedIn = computed(() => !!this.currentUser());
  readonly token = signal<string | null>(this.getStoredToken());

  constructor() {
    // If token exists, verify and refresh user profile
    if (this.token()) {
      this.getMe().subscribe({
        next: (res) => {
          const normalized = this.normalizeUser(res.user);
          this.currentUser.set(normalized);
          if (normalized) {
            localStorage.setItem('user', JSON.stringify(normalized));
          }
        },
        error: () => {
          this.logout();
        }
      });
    }
  }

  register(data: RegisterDto): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, data).pipe(
      tap((res) => {
        if (res.token && res.user) {
          this.setSession(res.token, res.user);
        }
      }),
      catchError((err) => {
        return throwError(() => err.error?.message || 'Registration failed');
      })
    );
  }

  login(data: LoginDto): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, data).pipe(
      tap((res) => {
        if (res.token && res.user) {
          this.setSession(res.token, res.user);
        }
      }),
      catchError((err) => {
        return throwError(() => err.error?.message || 'Login failed');
      })
    );
  }

  getMe(): Observable<{ status: string; user: User }> {
    return this.http.get<{ status: string; user: User }>(`${this.apiUrl}/me`);
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.token.set(null);
    this.currentUser.set(null);
    this.socketService.disconnect();
    this.router.navigate(['/auth/login']);
  }

  updateCurrentUser(user: User): void {
    const normalized = this.normalizeUser(user);
    this.currentUser.set(normalized);
    if (normalized) {
      localStorage.setItem('user', JSON.stringify(normalized));
    }
  }

  private setSession(token: string, user: User): void {
    const normalized = this.normalizeUser(user);
    localStorage.setItem('token', token);
    if (normalized) {
      localStorage.setItem('user', JSON.stringify(normalized));
    }
    this.token.set(token);
    this.currentUser.set(normalized);
    this.socketService.connect(token);
  }

  private normalizeUser(user: User | null): User | null {
    if (!user) return null;
    return {
      ...user,
      profileImage: user.profileImage ? resolveMediaUrl(user.profileImage) : ''
    };
  }

  private getStoredToken(): string | null {
    try {
      return localStorage.getItem('token');
    } catch {
      return null;
    }
  }

  private getStoredUser(): User | null {
    try {
      const userJson = localStorage.getItem('user');
      const parsed = userJson ? JSON.parse(userJson) : null;
      return this.normalizeUser(parsed);
    } catch {
      return null;
    }
  }
}
