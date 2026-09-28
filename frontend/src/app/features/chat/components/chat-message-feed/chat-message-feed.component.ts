import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Message } from '../../../../core/models/message.model';
import { Conversation } from '../../../../core/models/conversation.model';
import { AuthService } from '../../../../core/services/auth.service';
import { MediaUrlPipe } from '../../../../core/pipes/media-url.pipe';
import { resolveMediaUrl } from '../../../../core/utils/media-url.util';

@Component({
  selector: 'app-chat-message-feed',
  standalone: true,
  imports: [CommonModule, MediaUrlPipe],
  templateUrl: './chat-message-feed.component.html',
  styleUrl: './chat-message-feed.component.css'
})
export class ChatMessageFeedComponent {
  readonly authService = inject(AuthService);

  @ViewChild('messagesContainer') messagesContainer!: ElementRef<HTMLDivElement>;

  @Input() messages: Message[] = [];
  @Input() activeConversation: Conversation | null = null;
  @Input() currentUserId?: string;
  @Input() isLoadingMessages = false;
  @Input() typingIndicatorText = '';
  @Input() activeAudioMessageId: string | null = null;
  @Input() audioCurrentTimeMap: Record<string, number> = {};
  @Input() audioDurationMap: Record<string, number> = {};

  @Output() openLightbox = new EventEmitter<string>();
  @Output() toggleAudioPlayback = new EventEmitter<Message>();
  @Output() seekAudio = new EventEmitter<{ message: Message; event: MouseEvent; progressBar: HTMLElement }>();
  @Output() startReply = new EventEmitter<Message>();
  @Output() startEdit = new EventEmitter<Message>();
  @Output() deleteMessage = new EventEmitter<Message>();

  isCurrentUserSender(message: Message): boolean {
    const user = this.authService.currentUser();
    const currentId = (this.currentUserId || user?._id || (user as any)?.id)?.toString();
    if (!currentId || !message || !message.sender) return false;

    const rawSender = message.sender;
    let senderId: string | undefined;
    if (typeof rawSender === 'string') {
      senderId = rawSender;
    } else if (rawSender && typeof rawSender === 'object') {
      senderId = (rawSender._id || (rawSender as any).id)?.toString();
    }

    if (!senderId) return false;
    return String(senderId).trim() === String(currentId).trim();
  }

  getSenderName(message: Message): string {
    if (!message.sender) return 'User';
    return typeof message.sender === 'string' ? 'User' : message.sender.name;
  }

  getSenderAvatar(message: Message): string {
    if (!message.sender || typeof message.sender === 'string') return '';
    return resolveMediaUrl(message.sender.profileImage || '');
  }

  getReplyPreview(replyTo: string | Message | undefined): string {
    if (!replyTo) return '';
    if (typeof replyTo === 'string') return 'Original message';
    if (replyTo.isDeleted) return 'Deleted message';
    return replyTo.content || 'Attachment';
  }

  formatFileSize(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  formatDuration(seconds?: number): string {
    if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  getAudioCurrentTime(msgId: string): number {
    return this.audioCurrentTimeMap[msgId] || 0;
  }

  getAudioDuration(msg: Message): number {
    return this.audioDurationMap[msg._id] || msg.duration || 0;
  }

  getAudioProgressPercent(msg: Message): number {
    const cur = this.getAudioCurrentTime(msg._id);
    const dur = this.getAudioDuration(msg);
    if (!dur || dur <= 0) return 0;
    return Math.min(100, Math.round((cur / dur) * 100));
  }

  getOtherParticipant(conv: Conversation | null): any {
    if (!conv || conv.isGroup) return null;
    const currentId = this.authService.currentUser()?._id;
    return (conv.participants || []).find((p: any) => {
      const id = typeof p === 'string' ? p : p._id;
      return id !== currentId;
    });
  }

  getMessageReceipt(message: Message): 'sent' | 'delivered' | 'read' {
    const conv = this.activeConversation;
    const currentId = this.authService.currentUser()?._id;
    if (!conv || !currentId) return 'sent';

    const readBy = message.readBy || [];
    const deliveredTo = message.deliveredTo || [];

    if (conv.isGroup) {
      const otherReaders = readBy.filter(
        (id: any) => (typeof id === 'string' ? id : id._id) !== currentId
      );
      if (otherReaders.length > 0) return 'read';
      const otherDelivered = deliveredTo.filter(
        (id: any) => (typeof id === 'string' ? id : id._id) !== currentId
      );
      if (otherDelivered.length > 0) return 'delivered';
      return 'sent';
    }

    const other = this.getOtherParticipant(conv);
    if (!other) return 'sent';
    const otherId = typeof other === 'string' ? other : other._id;

    const hasRead = readBy.some(
      (id: any) => (typeof id === 'string' ? id : id._id) === otherId
    );
    if (hasRead) return 'read';

    const hasDelivered = deliveredTo.some(
      (id: any) => (typeof id === 'string' ? id : id._id) === otherId
    );
    if (hasDelivered) return 'delivered';

    return 'sent';
  }

  onSeekAudio(message: Message, event: MouseEvent, progressBar: HTMLElement): void {
    this.seekAudio.emit({ message, event, progressBar });
  }

  scrollToBottom(): void {
    if (this.messagesContainer) {
      const el = this.messagesContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }
}
