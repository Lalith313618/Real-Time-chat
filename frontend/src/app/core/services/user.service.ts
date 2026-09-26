import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User } from '../models/user.model';

export interface SearchUsersResponse {
  status: string;
  results: number;
  users: User[];
}

export interface UserProfileResponse {
  status: string;
  user: User;
}

export interface UpdateProfileDto {
  name?: string;
  profileImage?: string;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/users`;

  searchUsers(query: string): Observable<User[]> {
    return this.http
      .get<SearchUsersResponse>(`${this.apiUrl}/search`, {
        params: { q: query }
      })
      .pipe(map((res) => res.users));
  }

  getUserProfile(id: string): Observable<User> {
    return this.http
      .get<UserProfileResponse>(`${this.apiUrl}/profile/${id}`)
      .pipe(map((res) => res.user));
  }

  updateProfile(data: UpdateProfileDto): Observable<User> {
    return this.http
      .put<UserProfileResponse>(`${this.apiUrl}/profile`, data)
      .pipe(map((res) => res.user));
  }

  getAllUsers(): Observable<User[]> {
    return this.http
      .get<SearchUsersResponse>(this.apiUrl)
      .pipe(map((res) => res.users));
  }
}
