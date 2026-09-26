import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { User } from '../models/user.model';
import { SocketService } from './socket.service';

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
          this.currentUser.set(res.user);
          localStorage.setItem('user', JSON.stringify(res.user));
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

  private setSession(token: string, user: User): void {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    this.token.set(token);
    this.currentUser.set(user);
    this.socketService.connect(token);
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
      return userJson ? JSON.parse(userJson) : null;
    } catch {
      return null;
    }
  }
}
