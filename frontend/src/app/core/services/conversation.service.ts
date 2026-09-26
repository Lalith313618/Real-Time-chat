import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Conversation } from '../models/conversation.model';
import { User } from '../models/user.model';

export interface ConversationResponse {
  status: string;
  isNew?: boolean;
  conversation: Conversation;
}

export interface ConversationListResponse {
  status: string;
  results: number;
  conversations: Conversation[];
}

@Injectable({
  providedIn: 'root'
})
export class ConversationService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/conversations`;

  // Reactive signals
  readonly conversations = signal<Conversation[]>([]);
  readonly activeConversation = signal<Conversation | null>(null);
  readonly isLoading = signal<boolean>(false);

  getOrCreateConversation(participantId: string): Observable<Conversation> {
    this.isLoading.set(true);
    return this.http
      .post<ConversationResponse>(this.apiUrl, { participantId })
      .pipe(
        map((res) => res.conversation),
        tap((conversation) => {
          this.activeConversation.set(conversation);
          // Prepend or update in conversations list
          this.conversations.update((list) => {
            const index = list.findIndex((c) => c._id === conversation._id);
            if (index > -1) {
              const updated = [...list];
              updated[index] = conversation;
              return updated;
            }
            return [conversation, ...list];
          });
          this.isLoading.set(false);
        })
      );
  }

  getUserConversations(): Observable<Conversation[]> {
    this.isLoading.set(true);
    return this.http.get<ConversationListResponse>(this.apiUrl).pipe(
      map((res) => res.conversations),
      tap((conversations) => {
        this.conversations.set(conversations);
        this.isLoading.set(false);
      })
    );
  }

  getConversationById(id: string): Observable<Conversation> {
    return this.http
      .get<{ status: string; conversation: Conversation }>(`${this.apiUrl}/${id}`)
      .pipe(
        map((res) => res.conversation),
        tap((conversation) => {
          this.activeConversation.set(conversation);
        })
      );
  }

  createGroup(data: {
    groupName: string;
    participants: string[];
    groupImage?: string;
  }): Observable<Conversation> {
    this.isLoading.set(true);
    return this.http
      .post<{ status: string; conversation: Conversation }>(`${this.apiUrl}/group`, data)
      .pipe(
        map((res) => res.conversation),
        tap((conversation) => {
          this.conversations.update((list) => [conversation, ...list]);
          this.activeConversation.set(conversation);
          this.isLoading.set(false);
        })
      );
  }

  updateGroup(
    id: string,
    data: { groupName?: string; groupImage?: string }
  ): Observable<Conversation> {
    return this.http
      .put<{ status: string; conversation: Conversation }>(`${this.apiUrl}/${id}/group`, data)
      .pipe(
        map((res) => res.conversation),
        tap((conversation) => {
          this.conversations.update((list) =>
            list.map((c) => (c._id === id ? conversation : c))
          );
          if (this.activeConversation()?._id === id) {
            this.activeConversation.set(conversation);
          }
        })
      );
  }

  addGroupMembers(id: string, memberIds: string[]): Observable<Conversation> {
    return this.http
      .put<{ status: string; conversation: Conversation }>(`${this.apiUrl}/${id}/members/add`, {
        memberIds,
      })
      .pipe(
        map((res) => res.conversation),
        tap((conversation) => {
          this.conversations.update((list) =>
            list.map((c) => (c._id === id ? conversation : c))
          );
          if (this.activeConversation()?._id === id) {
            this.activeConversation.set(conversation);
          }
        })
      );
  }

  removeGroupMember(id: string, memberId: string): Observable<Conversation> {
    return this.http
      .put<{ status: string; conversation: Conversation }>(
        `${this.apiUrl}/${id}/members/remove`,
        { memberId }
      )
      .pipe(
        map((res) => res.conversation),
        tap((conversation) => {
          this.conversations.update((list) =>
            list.map((c) => (c._id === id ? conversation : c))
          );
          if (this.activeConversation()?._id === id) {
            this.activeConversation.set(conversation);
          }
        })
      );
  }

  toggleGroupAdmin(
    id: string,
    memberId: string,
    action?: 'promote' | 'demote'
  ): Observable<Conversation> {
    return this.http
      .put<{ status: string; conversation: Conversation }>(
        `${this.apiUrl}/${id}/admins/toggle`,
        { memberId, action }
      )
      .pipe(
        map((res) => res.conversation),
        tap((conversation) => {
          this.conversations.update((list) =>
            list.map((c) => (c._id === id ? conversation : c))
          );
          if (this.activeConversation()?._id === id) {
            this.activeConversation.set(conversation);
          }
        })
      );
  }

  leaveGroup(id: string): Observable<Conversation> {
    return this.http
      .put<{ status: string; message: string; conversation: Conversation }>(
        `${this.apiUrl}/${id}/leave`,
        {}
      )
      .pipe(
        map((res) => res.conversation),
        tap(() => {
          this.conversations.update((list) => list.filter((c) => c._id !== id));
          if (this.activeConversation()?._id === id) {
            this.activeConversation.set(null);
          }
        })
      );
  }

  deleteConversation(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(
      tap(() => {
        this.conversations.update((list) => list.filter((c) => c._id !== id));
        if (this.activeConversation()?._id === id) {
          this.activeConversation.set(null);
        }
      })
    );
  }

  clearChatHistory(id: string): Observable<{ status: string; message: string }> {
    return this.http
      .delete<{ status: string; message: string }>(`${this.apiUrl}/${id}/messages`)
      .pipe(
        tap(() => {
          this.conversations.update((list) =>
            list.map((c) => (c._id === id ? { ...c, lastMessage: '' } : c))
          );
        })
      );
  }

  getOtherParticipant(conversation: Conversation, currentUserId: string): User | null {
    if (!conversation || !conversation.participants) return null;
    const other = conversation.participants.find(
      (p) => (typeof p === 'string' ? p : p._id) !== currentUserId
    );
    return (other as User) || null;
  }
}

