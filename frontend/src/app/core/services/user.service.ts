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

export interface UploadAvatarResponse {
  status: string;
  message: string;
  fileUrl: string;
  user: User;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/users`;

  uploadAvatar(file: File | Blob): Observable<{ user: User; fileUrl: string }> {
    const formData = new FormData();
    formData.append('avatar', file, 'avatar.jpg');
    return this.http
      .post<UploadAvatarResponse>(`${this.apiUrl}/avatar`, formData)
      .pipe(map((res) => ({ user: res.user, fileUrl: res.fileUrl })));
  }

  removeAvatar(): Observable<User> {
    return this.http
      .delete<UserProfileResponse>(`${this.apiUrl}/avatar`)
      .pipe(map((res) => res.user));
  }

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
