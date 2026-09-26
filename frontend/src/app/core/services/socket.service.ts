import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Message } from '../models/message.model';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;
  private readonly isConnectedSubject = new BehaviorSubject<boolean>(false);
  public readonly isConnected$: Observable<boolean> = this.isConnectedSubject.asObservable();
  private readonly socketIdSubject = new BehaviorSubject<string | null>(null);
  public readonly socketId$: Observable<string | null> = this.socketIdSubject.asObservable();

  // Reactive set of currently online user IDs
  readonly onlineUsers = signal<Set<string>>(new Set());

  private currentConnectedToken: string | null = null;

  connect(token?: string): void {
    const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('token') : null);

    // If socket exists, is connected, and was authenticated with THIS EXACT TOKEN, reuse it
    if (this.socket && this.socket.connected && this.currentConnectedToken === authToken) {
      return;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    if (!authToken) {
      this.currentConnectedToken = null;
      return;
    }

    this.currentConnectedToken = authToken;
    this.socket = io(environment.socketUrl, {
      auth: { token: authToken },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      this.isConnectedSubject.next(true);
      this.socketIdSubject.next(this.socket?.id || null);
      console.log('[SocketService] Connected to Socket.IO, ID:', this.socket?.id);

      // Fetch initial list of online users
      this.socket?.emit('get_online_users', (res: any) => {
        if (res && res.onlineUsers) {
          this.onlineUsers.set(new Set(res.onlineUsers));
        }
      });
    });

    this.socket.on('disconnect', () => {
      this.isConnectedSubject.next(false);
      this.socketIdSubject.next(null);
      console.log('[SocketService] Disconnected from Socket.IO server');
    });

    this.socket.on('connect_error', (error) => {
      console.error('[SocketService] Connection error:', error.message);
      this.isConnectedSubject.next(false);
    });

    // Real-time presence listeners
    this.socket.on('user_online', (data: { userId: string }) => {
      this.onlineUsers.update((set) => {
        const next = new Set(set);
        next.add(data.userId);
        return next;
      });
    });

    this.socket.on('user_offline', (data: { userId: string; lastSeen: string | Date }) => {
      this.onlineUsers.update((set) => {
        const next = new Set(set);
        next.delete(data.userId);
        return next;
      });
    });
  }

  joinConversation(conversationId: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket || !conversationId) return resolve(null);
      this.socket.emit('join_conversation', conversationId, (ack: any) => resolve(ack));
    });
  }

  leaveConversation(conversationId: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket || !conversationId) return resolve(null);
      this.socket.emit('leave_conversation', conversationId, (ack: any) => resolve(ack));
    });
  }

  emitTypingStart(conversationId: string): void {
    if (this.socket && this.socket.connected && conversationId) {
      this.socket.emit('typing_start', { conversationId });
    }
  }

  emitTypingStop(conversationId: string): void {
    if (this.socket && this.socket.connected && conversationId) {
      this.socket.emit('typing_stop', { conversationId });
    }
  }

  emitSendMessage(data: {
    conversationId: string;
    content: string;
    messageType?: string;
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    duration?: number;
    replyTo?: string | null;
  }): Promise<Message> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('Socket is not connected'));
        return;
      }

      this.socket.emit('send_message', data, (res: any) => {
        if (res && res.status === 'success') {
          resolve(res.message);
        } else {
          reject(new Error(res?.message || 'Failed to send real-time message'));
        }
      });
    });
  }

  emitEditMessage(data: {
    messageId: string;
    conversationId: string;
    content: string;
  }): Promise<Message> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('Socket is not connected'));
        return;
      }

      this.socket.emit('edit_message', data, (res: any) => {
        if (res && res.status === 'success') {
          resolve(res.message);
        } else {
          reject(new Error(res?.message || 'Failed to edit real-time message'));
        }
      });
    });
  }

  emitDeleteMessage(data: {
    messageId: string;
    conversationId: string;
  }): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('Socket is not connected'));
        return;
      }

      this.socket.emit('delete_message', data, (res: any) => {
        if (res && res.status === 'success') {
          resolve(res);
        } else {
          reject(new Error(res?.message || 'Failed to delete real-time message'));
        }
      });
    });
  }

  emitClearChat(conversationId: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('clear_chat', { conversationId });
    }
  }

  onNewMessage(): Observable<Message> {
    return new Observable<Message>((observer) => {
      if (!this.socket) return;
      const handler = (msg: Message) => observer.next(msg);
      this.socket.on('new_message', handler);
      return () => {
        this.socket?.off('new_message', handler);
      };
    });
  }

  onMessageEdited(): Observable<Message> {
    return new Observable<Message>((observer) => {
      if (!this.socket) return;
      const handler = (msg: Message) => observer.next(msg);
      this.socket.on('message_edited', handler);
      return () => {
        this.socket?.off('message_edited', handler);
      };
    });
  }

  onMessageDeleted(): Observable<{ messageId: string; conversationId: string; content: string; isDeleted: boolean }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('message_deleted', handler);
      return () => {
        this.socket?.off('message_deleted', handler);
      };
    });
  }

  onConversationUpdated(): Observable<{
    conversationId: string;
    lastMessage: string;
    lastMessageSender: string;
    lastMessageAt: string | Date;
  }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('conversation_updated', handler);
      return () => {
        this.socket?.off('conversation_updated', handler);
      };
    });
  }

  onUserOnline(): Observable<{ userId: string }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('user_online', handler);
      return () => {
        this.socket?.off('user_online', handler);
      };
    });
  }

  onUserOffline(): Observable<{ userId: string; lastSeen: string | Date }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('user_offline', handler);
      return () => {
        this.socket?.off('user_offline', handler);
      };
    });
  }

  onTypingStart(): Observable<{ conversationId: string; userId: string; userName: string }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('typing_start', handler);
      return () => {
        this.socket?.off('typing_start', handler);
      };
    });
  }

  onTypingStop(): Observable<{ conversationId: string; userId: string }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('typing_stop', handler);
      return () => {
        this.socket?.off('typing_stop', handler);
      };
    });
  }

  emitMarkRead(conversationId: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected || !conversationId) return resolve(null);
      this.socket.emit('mark_read', { conversationId }, (res: any) => resolve(res));
    });
  }

  emitMarkDelivered(conversationId: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected || !conversationId) return resolve(null);
      this.socket.emit('mark_delivered', { conversationId }, (res: any) => resolve(res));
    });
  }

  onMessagesRead(): Observable<{ conversationId: string; readerId: string; readAt: string | Date }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('messages_read', handler);
      return () => {
        this.socket?.off('messages_read', handler);
      };
    });
  }

  onMessagesDelivered(): Observable<{ conversationId: string; userId: string }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('messages_delivered', handler);
      return () => {
        this.socket?.off('messages_delivered', handler);
      };
    });
  }

  onUnreadCleared(): Observable<{ conversationId: string }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('unread_cleared', handler);
      return () => {
        this.socket?.off('unread_cleared', handler);
      };
    });
  }

  onGroupCreated(): Observable<any> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('group_created', handler);
      return () => {
        this.socket?.off('group_created', handler);
      };
    });
  }

  onGroupUpdated(): Observable<any> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('group_updated', handler);
      return () => {
        this.socket?.off('group_updated', handler);
      };
    });
  }

  onChatCleared(): Observable<{ conversationId: string; clearedBy: string }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('chat_cleared', handler);
      return () => {
        this.socket?.off('chat_cleared', handler);
      };
    });
  }

  onMemberAdded(): Observable<{ conversation: any; addedMembers: any[] }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('member_added', handler);
      return () => {
        this.socket?.off('member_added', handler);
      };
    });
  }

  onMemberRemoved(): Observable<{ conversationId: string; memberId: string; conversation: any }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('member_removed', handler);
      return () => {
        this.socket?.off('member_removed', handler);
      };
    });
  }

  onGroupLeft(): Observable<{ conversationId: string; userId: string; userName: string; conversation: any }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('group_left', handler);
      return () => {
        this.socket?.off('group_left', handler);
      };
    });
  }

  onGroupRemoved(): Observable<{ conversationId: string }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('group_removed', handler);
      return () => {
        this.socket?.off('group_removed', handler);
      };
    });
  }

  isUserOnline(userId: string): boolean {
    return this.onlineUsers().has(userId);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentConnectedToken = null;
    this.isConnectedSubject.next(false);
    this.socketIdSubject.next(null);
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}
