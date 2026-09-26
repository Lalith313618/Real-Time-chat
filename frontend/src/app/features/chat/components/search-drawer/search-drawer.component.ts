import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Message } from '../../../../core/models/message.model';

@Component({
  selector: 'app-search-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search-drawer.component.html',
  styleUrl: './search-drawer.component.css'
})
export class SearchDrawerComponent {
  @Input() isOpen = false;
  @Input() searchQuery = '';
  @Input() searchResults: Message[] = [];
  @Input() currentResultIndex = 0;
  @Input() isSearching = false;

  @Output() searchChange = new EventEmitter<string>();
  @Output() clear = new EventEmitter<void>();
  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  onQueryChange(val: string): void {
    this.searchChange.emit(val);
  }

  onClear(): void {
    this.clear.emit();
  }

  onPrev(): void {
    this.prev.emit();
  }

  onNext(): void {
    this.next.emit();
  }

  onClose(): void {
    this.close.emit();
  }
}
