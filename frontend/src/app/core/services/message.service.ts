import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Message, MessageType, MessageReaction } from '../models/message.model';
import { resolveMediaUrl } from '../utils/media-url.util';

export interface SendMessageDto {
  conversationId: string;
  content: string;
  messageType?: MessageType;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
  replyTo?: string | null;
  mentions?: string[];
}

export interface UploadedFile {
  fileUrl: string;
  publicId: string;
  resourceType: string;
  fileName: string;
  fileSize: number;
  mimetype: string;
}

export interface UploadResponse {
  status: string;
  file: UploadedFile;
}

export interface MessagesResponse {
  status: string;
  results: number;
  pagination: {
    total: number;
    page: number;
    totalPages: number;
    limit: number;
    hasMore: boolean;
  };
  messages: Message[];
}

@Injectable({
  providedIn: 'root'
})
export class MessageService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/messages`;

  // Reactive state signals
  readonly messages = signal<Message[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly isSending = signal<boolean>(false);
  readonly activeReplyTo = signal<Message | null>(null);

  normalizeMessage(m: Message): Message {
    if (!m) return m;
    let sender = m.sender;
    if (typeof sender === 'object' && sender !== null) {
      sender = {
        ...sender,
        profileImage: sender.profileImage ? resolveMediaUrl(sender.profileImage) : ''
      };
    }
    return {
      ...m,
      fileUrl: m.fileUrl ? resolveMediaUrl(m.fileUrl) : '',
      sender
    };
  }

  getConversationMessages(conversationId: string, page = 1, limit = 50): Observable<MessagesResponse> {
    this.isLoading.set(true);
    return this.http
      .get<MessagesResponse>(`${this.apiUrl}/${conversationId}`, {
        params: { page, limit }
      })
      .pipe(
        map((res) => ({
          ...res,
          messages: (res.messages || []).map((m) => this.normalizeMessage(m))
        })),
        tap((res) => {
          this.messages.set(res.messages);
          this.isLoading.set(false);
        })
      );
  }

  sendMessage(dto: SendMessageDto): Observable<Message> {
    this.isSending.set(true);
    return this.http
      .post<{ status: string; message: Message }>(this.apiUrl, dto)
      .pipe(
        map((res) => this.normalizeMessage(res.message)),
        tap((newMsg) => {
          this.messages.update((list) => [...list, newMsg]);
          this.activeReplyTo.set(null);
          this.isSending.set(false);
        })
      );
  }

  editMessage(messageId: string, content: string): Observable<Message> {
    return this.http
      .put<{ status: string; message: Message }>(`${this.apiUrl}/${messageId}`, { content })
      .pipe(
        map((res) => this.normalizeMessage(res.message)),
        tap((updatedMsg) => {
          this.messages.update((list) =>
            list.map((m) => (m._id === messageId ? updatedMsg : m))
          );
        })
      );
  }

  deleteMessage(messageId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${messageId}`).pipe(
      tap(() => {
        this.messages.update((list) =>
          list.map((m) =>
            m._id === messageId
              ? { ...m, isDeleted: true, content: 'This message was deleted', fileUrl: '' }
              : m
          )
        );
      })
    );
  }

  markAsRead(messageId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/${messageId}/read`, {});
  }

  markAllAsRead(conversationId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/conversation/${conversationId}/read-all`, {});
  }

  searchMessages(conversationId: string, q: string): Observable<Message[]> {
    return this.http
      .get<{ status: string; results: number; messages: Message[] }>(
        `${this.apiUrl}/search/${conversationId}`,
        { params: { q } }
      )
      .pipe(map((res) => res.messages));
  }

  uploadAttachment(file: File, target = 'message'): Observable<HttpEvent<UploadResponse>> {
    const formData = new FormData();
    formData.append('file', file);

    const req = new HttpRequest('POST', `${this.apiUrl}/upload?target=${target}`, formData, {
      reportProgress: true,
    });

    return this.http.request<UploadResponse>(req);
  }

  setReplyTo(message: Message | null): void {
    this.activeReplyTo.set(message);
  }

  getThreadReplies(messageId: string): Observable<{ status: string; rootMessage: Message; replies: Message[]; count: number }> {
    return this.http
      .get<{ status: string; rootMessage: Message; replies: Message[]; count: number }>(
        `${this.apiUrl}/${messageId}/thread`
      )
      .pipe(
        map((res) => ({
          ...res,
          rootMessage: this.normalizeMessage(res.rootMessage),
          replies: (res.replies || []).map((r) => this.normalizeMessage(r)),
        }))
      );
  }

  sendThreadReply(
    messageId: string,
    content: string,
    extra: { messageType?: MessageType; fileUrl?: string; fileName?: string; fileSize?: number; mentions?: string[] } = {}
  ): Observable<{ status: string; reply: Message; rootMessage: Message }> {
    return this.http
      .post<{ status: string; reply: Message; rootMessage: Message }>(
        `${this.apiUrl}/${messageId}/thread`,
        { content, ...extra }
      )
      .pipe(
        map((res) => ({
          ...res,
          reply: this.normalizeMessage(res.reply),
          rootMessage: this.normalizeMessage(res.rootMessage),
        }))
      );
  }

  toggleReaction(
    messageId: string,
    emoji: string
  ): Observable<{ status: string; messageId: string; reactions: MessageReaction[] }> {
    return this.http.post<{ status: string; messageId: string; reactions: MessageReaction[] }>(
      `${this.apiUrl}/${messageId}/reactions`,
      { emoji }
    );
  }

  getUserMentions(page = 1, limit = 30): Observable<{
    status: string;
    results: number;
    total: number;
    page: number;
    totalPages: number;
    messages: Message[];
  }> {
    return this.http
      .get<{
        status: string;
        results: number;
        total: number;
        page: number;
        totalPages: number;
        messages: Message[];
      }>(`${this.apiUrl}/mentions?page=${page}&limit=${limit}`)
      .pipe(
        map((res) => ({
          ...res,
          messages: (res.messages || []).map((m) => this.normalizeMessage(m)),
        }))
      );
  }
}

