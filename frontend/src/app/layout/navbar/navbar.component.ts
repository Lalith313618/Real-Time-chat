import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { SocketService } from '../../core/services/socket.service';
import { NetworkService } from '../../core/services/network.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css'
})
export class NavbarComponent implements OnInit, OnDestroy {
  readonly authService = inject(AuthService);
  readonly socketService = inject(SocketService);
  readonly networkService = inject(NetworkService);
  private readonly router = inject(Router);

  currentPath = signal<string>('/');
  socketConnected = signal<boolean>(false);

  private sub = new Subscription();

  ngOnInit(): void {
    this.currentPath.set(this.router.url.split('?')[0]);
    this.sub.add(
      this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe((event) => {
          this.currentPath.set(event.urlAfterRedirects.split('?')[0]);
        })
    );

    this.sub.add(
      this.socketService.isConnected$.subscribe((connected) => {
        this.socketConnected.set(connected);
      })
    );
  }

  logout(): void {
    this.authService.logout();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
