import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { NetworkService } from '../../core/services/network.service';
import { MediaUrlPipe } from '../../core/pipes/media-url.pipe';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, MediaUrlPipe],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css'
})
export class NavbarComponent implements OnInit, OnDestroy {
  readonly authService = inject(AuthService);
  readonly networkService = inject(NetworkService);
  private readonly router = inject(Router);

  currentPath = signal<string>('/');
  navbarAvatarFailed = signal<boolean>(false);

  readonly isAuthPage = computed(() => {
    const path = this.currentPath();
    return path.startsWith('/auth/login') || path.startsWith('/auth/register');
  });

  private sub = new Subscription();

  ngOnInit(): void {
    this.syncCurrentPath();

    this.sub.add(
      this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe((event) => {
          const path = (event.urlAfterRedirects || event.url || '/').split('?')[0].split('#')[0];
          this.currentPath.set(path);
        })
    );
  }

  private syncCurrentPath(): void {
    let path = '/';
    if (typeof window !== 'undefined' && window.location?.pathname) {
      path = window.location.pathname;
    } else if (this.router.url) {
      path = this.router.url;
    }
    this.currentPath.set(path.split('?')[0].split('#')[0]);
  }

  logout(): void {
    this.authService.logout();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
