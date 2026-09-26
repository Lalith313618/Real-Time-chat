import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface HealthResponse {
  status: string;
  message: string;
  database: string;
  uptime: number;
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiHealthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  checkHealth(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(`${this.apiUrl}/health`);
  }
}
