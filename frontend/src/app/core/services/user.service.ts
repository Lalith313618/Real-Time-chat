import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User, UpdateProfileDto } from '../models/user.model';
import { resolveMediaUrl } from '../utils/media-url.util';

export interface SearchUsersResponse {
  status: string;
  results: number;
  users: User[];
}

export interface UserProfileResponse {
  status: string;
  user: User;
}

export interface UploadAvatarResponse {
  status: string;
  message: string;
  fileUrl: string;
  user: User;
}

export interface DirectoryFilterParams {
  q?: string;
  department?: string;
  presence?: string;
  orgId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/users`;

  private normalizeUser(user: User): User {
    if (!user) return user;
    return {
      ...user,
      profileImage: user.profileImage ? resolveMediaUrl(user.profileImage) : '',
    };
  }

  getUserDirectory(params?: DirectoryFilterParams): Observable<User[]> {
    let httpParams = new HttpParams();
    if (params?.q) httpParams = httpParams.set('q', params.q);
    if (params?.department) httpParams = httpParams.set('department', params.department);
    if (params?.presence) httpParams = httpParams.set('presence', params.presence);
    if (params?.orgId) httpParams = httpParams.set('orgId', params.orgId);

    return this.http
      .get<SearchUsersResponse>(`${this.apiUrl}/directory`, { params: httpParams })
      .pipe(map((res) => (res.users || []).map((u) => this.normalizeUser(u))));
  }

  getDepartments(): Observable<string[]> {
    return this.http
      .get<{ status: string; results: number; departments: string[] }>(
        `${this.apiUrl}/departments`
      )
      .pipe(map((res) => res.departments || []));
  }

  uploadAvatar(file: File | Blob): Observable<{ user: User; fileUrl: string }> {
    const formData = new FormData();
    formData.append('avatar', file, 'avatar.jpg');
    return this.http
      .post<UploadAvatarResponse>(`${this.apiUrl}/avatar`, formData)
      .pipe(
        map((res) => ({
          user: this.normalizeUser(res.user),
          fileUrl: resolveMediaUrl(res.fileUrl),
        }))
      );
  }

  removeAvatar(): Observable<User> {
    return this.http
      .delete<UserProfileResponse>(`${this.apiUrl}/avatar`)
      .pipe(map((res) => this.normalizeUser(res.user)));
  }

  searchUsers(query: string): Observable<User[]> {
    return this.http
      .get<SearchUsersResponse>(`${this.apiUrl}/search`, {
        params: { q: query },
      })
      .pipe(map((res) => (res.users || []).map((u) => this.normalizeUser(u))));
  }

  getUserProfile(id: string): Observable<User> {
    return this.http
      .get<UserProfileResponse>(`${this.apiUrl}/profile/${id}`)
      .pipe(map((res) => this.normalizeUser(res.user)));
  }

  updateProfile(data: UpdateProfileDto): Observable<User> {
    return this.http
      .put<UserProfileResponse>(`${this.apiUrl}/profile`, data)
      .pipe(map((res) => this.normalizeUser(res.user)));
  }

  getAllUsers(): Observable<User[]> {
    return this.http
      .get<SearchUsersResponse>(this.apiUrl)
      .pipe(map((res) => (res.users || []).map((u) => this.normalizeUser(u))));
  }
}
