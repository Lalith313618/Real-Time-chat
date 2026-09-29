import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { NetworkService } from '../../core/services/network.service';
import { OrganizationService } from '../../core/services/organization.service';
import { NotificationService } from '../../core/services/notification.service';
import { Notification } from '../../core/models/notification.model';
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
  readonly orgService = inject(OrganizationService);
  readonly notifService = inject(NotificationService);
  private readonly router = inject(Router);

  currentPath = signal<string>('/');
  navbarAvatarFailed = signal<boolean>(false);
  isOrgDropdownOpen = signal<boolean>(false);

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
          this.isOrgDropdownOpen.set(false);
          this.notifService.closeDropdown();
        })
    );

    if (this.authService.isLoggedIn()) {
      this.orgService.loadUserOrganizations().subscribe({ error: () => {} });
      this.notifService.loadNotifications({ limit: 15 }).subscribe({ error: () => {} });
    }
  }

  toggleNotifications(): void {
    this.isOrgDropdownOpen.set(false);
    this.notifService.toggleDropdown();
  }

  handleNotificationClick(notif: Notification): void {
    if (!notif.isRead) {
      this.notifService.markAsRead(notif._id).subscribe({ error: () => {} });
    }
    this.notifService.closeDropdown();
    this.notifService.dismissToast();

    if (notif.link) {
      this.router.navigateByUrl(notif.link);
    }
  }

  markAllAsRead(): void {
    this.notifService.markAllAsRead().subscribe({ error: () => {} });
  }

  toggleOrgDropdown(): void {
    this.isOrgDropdownOpen.update((v) => !v);
  }

  switchWorkspace(orgId: string): void {
    this.orgService.switchOrganization(orgId).subscribe({
      next: () => {
        this.isOrgDropdownOpen.set(false);
      },
      error: () => {
        this.isOrgDropdownOpen.set(false);
      },
    });
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
