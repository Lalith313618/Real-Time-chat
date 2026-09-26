import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { ApiHealthService, HealthResponse } from './core/services/api-health.service';
import { SocketService } from './core/services/socket.service';
import { AuthService } from './core/services/auth.service';
import { User } from './core/models/user.model';
import { NetworkService } from './core/services/network.service';

import { NavbarComponent } from './layout/navbar/navbar.component';
import { MobileNavComponent } from './layout/mobile-nav/mobile-nav.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent, MobileNavComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  readonly authService = inject(AuthService);
  readonly networkService = inject(NetworkService);
  private readonly healthService = inject(ApiHealthService);
  private readonly socketService = inject(SocketService);
  private readonly router = inject(Router);

  // Reactive state signals
  healthData = signal<HealthResponse | null>(null);
  healthLoading = signal<boolean>(false);
  healthError = signal<string | null>(null);
  socketConnected = signal<boolean>(false);
  socketId = signal<string | null>(null);

  // Route tracking
  currentPath = signal<string>('/');
  isSubPage = computed(() => {
    const p = this.currentPath();
    return p !== '/' && p !== '';
  });

  private sub = new Subscription();

  ngOnInit(): void {
    // 1. Initial health check
    this.refreshHealth();

    // 2. Connect socket
    this.socketService.connect();
    this.sub.add(
      this.socketService.isConnected$.subscribe((connected) => {
        this.socketConnected.set(connected);
      })
    );
    this.sub.add(
      this.socketService.socketId$.subscribe((id) => {
        this.socketId.set(id);
      })
    );

    // 3. Monitor route changes
    this.currentPath.set(this.router.url.split('?')[0]);
    this.sub.add(
      this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe((event) => {
          this.currentPath.set(event.urlAfterRedirects.split('?')[0]);
        })
    );
  }

  refreshHealth(): void {
    this.healthLoading.set(true);
    this.healthError.set(null);

    this.healthService.checkHealth().subscribe({
      next: (data) => {
        this.healthData.set(data);
        this.healthLoading.set(false);
      },
      error: (err) => {
        console.error('Health check failed:', err);
        this.healthError.set(err.message || 'Failed to connect to backend server');
        this.healthLoading.set(false);
      }
    });
  }

  logout(): void {
    this.authService.logout();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.socketService.disconnect();
  }
}
