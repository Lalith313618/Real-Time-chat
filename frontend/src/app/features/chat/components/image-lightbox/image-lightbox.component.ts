import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-image-lightbox',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-lightbox.component.html',
  styleUrl: './image-lightbox.component.css'
})
export class ImageLightboxComponent {
  @Input() imageUrl: string | null = null;
  @Output() close = new EventEmitter<void>();

  onClose(): void {
    this.close.emit();
  }
}
