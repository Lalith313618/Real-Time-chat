import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { MediaUrlPipe } from '../../core/pipes/media-url.pipe';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, MediaUrlPipe],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  readonly authService = inject(AuthService);
}
