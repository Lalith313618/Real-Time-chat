import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Message } from '../../../../core/models/message.model';

@Component({
  selector: 'app-chat-input-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-input-bar.component.html',
  styleUrl: './chat-input-bar.component.css'
})
export class ChatInputBarComponent {
  @ViewChild('fileInput') private fileInputRef!: ElementRef<HTMLInputElement>;

  @Input() replyingTo: Message | null = null;
  @Input() editingMessage: Message | null = null;
  @Input() selectedFile: File | null = null;
  @Input() filePreviewUrl: string | null = null;
  @Input() uploadProgress = 0;
  @Input() isUploading = false;
  @Input() uploadedFileData: any = null;
  @Input() uploadError = '';
  @Input() messageInput = '';
  @Input() isSending = false;

  @Output() cancelReply = new EventEmitter<void>();
  @Output() cancelEdit = new EventEmitter<void>();
  @Output() cancelAttachment = new EventEmitter<void>();
  @Output() fileSelected = new EventEmitter<Event>();
  @Output() messageInputChange = new EventEmitter<string>();
  @Output() sendMessage = new EventEmitter<void>();

  triggerFileInput(): void {
    if (this.fileInputRef) {
      this.fileInputRef.nativeElement.click();
    }
  }

  onFileSelected(event: Event): void {
    this.fileSelected.emit(event);
  }

  onInputChange(val: string): void {
    this.messageInputChange.emit(val);
  }

  onSendMessage(): void {
    this.sendMessage.emit();
  }

  getSenderName(message: Message | null): string {
    if (!message || !message.sender) return 'User';
    return typeof message.sender === 'string' ? 'User' : message.sender.name;
  }

  formatFileSize(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
