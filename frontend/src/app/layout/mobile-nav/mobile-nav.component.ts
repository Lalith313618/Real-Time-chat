import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-mobile-nav',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './mobile-nav.component.html',
  styleUrl: './mobile-nav.component.css'
})
export class MobileNavComponent implements OnInit, OnDestroy {
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  currentPath = signal<string>('/');
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
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
