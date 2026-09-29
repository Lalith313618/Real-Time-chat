import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Message, MessageReaction } from '../models/message.model';

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

  // ==========================================
  // REAL-TIME CHANNEL CHAT SOCKET METHODS
  // ==========================================

  joinChannel(channelId: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected || !channelId) return resolve(null);
      this.socket.emit('join_channel', { channelId }, (res: any) => resolve(res));
    });
  }

  leaveChannel(channelId: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected || !channelId) return resolve(null);
      this.socket.emit('leave_channel', { channelId }, (res: any) => resolve(res));
    });
  }

  sendChannelMessage(data: {
    channelId: string;
    content: string;
    messageType?: string;
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    replyTo?: string | null;
    mentions?: string[];
  }): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error('Socket disconnected'));
      }
      this.socket.emit('send_channel_message', data, (res: any) => {
        if (res?.status === 'success') {
          resolve(res.message);
        } else {
          reject(new Error(res?.message || 'Failed to send channel message'));
        }
      });
    });
  }

  onNewChannelMessage(): Observable<Message> {
    return new Observable<Message>((observer) => {
      if (!this.socket) return;
      const handler = (msg: Message) => observer.next(msg);
      this.socket.on('new_channel_message', handler);
      return () => {
        this.socket?.off('new_channel_message', handler);
      };
    });
  }

  emitChannelTypingStart(channelId: string): void {
    if (!this.socket || !this.socket.connected || !channelId) return;
    this.socket.emit('channel_typing_start', { channelId });
  }

  emitChannelTypingStop(channelId: string): void {
    if (!this.socket || !this.socket.connected || !channelId) return;
    this.socket.emit('channel_typing_stop', { channelId });
  }

  onChannelTypingStart(): Observable<{ channelId: string; userId: string; userName: string }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('channel_typing_start', handler);
      return () => {
        this.socket?.off('channel_typing_start', handler);
      };
    });
  }

  onChannelTypingStop(): Observable<{ channelId: string; userId: string }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('channel_typing_stop', handler);
      return () => {
        this.socket?.off('channel_typing_stop', handler);
      };
    });
  }

  onChannelMessageEdited(): Observable<Message> {
    return new Observable<Message>((observer) => {
      if (!this.socket) return;
      const handler = (msg: Message) => observer.next(msg);
      this.socket.on('channel_message_edited', handler);
      return () => {
        this.socket?.off('channel_message_edited', handler);
      };
    });
  }

  onChannelMessageDeleted(): Observable<{ messageId: string; channelId: string; content: string; isDeleted: boolean }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('channel_message_deleted', handler);
      return () => {
        this.socket?.off('channel_message_deleted', handler);
      };
    });
  }

  // ==========================================
  // REAL-TIME THREAD SOCKET METHODS
  // ==========================================

  joinThread(messageId: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected || !messageId) return resolve(null);
      this.socket.emit('join_thread', { messageId }, (res: any) => resolve(res));
    });
  }

  leaveThread(messageId: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected || !messageId) return resolve(null);
      this.socket.emit('leave_thread', { messageId }, (res: any) => resolve(res));
    });
  }

  sendThreadReply(data: {
    messageId: string;
    content: string;
    messageType?: string;
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    mentions?: string[];
  }): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error('Socket disconnected'));
      }
      this.socket.emit('send_thread_reply', data, (res: any) => {
        if (res?.status === 'success') {
          resolve(res);
        } else {
          reject(new Error(res?.message || 'Failed to send thread reply'));
        }
      });
    });
  }

  onNewThreadReply(): Observable<Message> {
    return new Observable<Message>((observer) => {
      if (!this.socket) return;
      const handler = (msg: Message) => observer.next(msg);
      this.socket.on('new_thread_reply', handler);
      return () => {
        this.socket?.off('new_thread_reply', handler);
      };
    });
  }

  onThreadUpdated(): Observable<{
    rootMessageId: string;
    threadCount: number;
    threadLastReplyAt: string | Date;
    threadParticipants: any[];
    latestReply: Message;
  }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('thread_updated', handler);
      return () => {
        this.socket?.off('thread_updated', handler);
      };
    });
  }

  emitThreadTypingStart(messageId: string): void {
    if (!this.socket || !this.socket.connected || !messageId) return;
    this.socket.emit('thread_typing_start', { messageId });
  }

  emitThreadTypingStop(messageId: string): void {
    if (!this.socket || !this.socket.connected || !messageId) return;
    this.socket.emit('thread_typing_stop', { messageId });
  }

  onThreadTypingStart(): Observable<{ messageId: string; userId: string; userName: string }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('thread_typing_start', handler);
      return () => {
        this.socket?.off('thread_typing_start', handler);
      };
    });
  }

  onThreadTypingStop(): Observable<{ messageId: string; userId: string }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('thread_typing_stop', handler);
      return () => {
        this.socket?.off('thread_typing_stop', handler);
      };
    });
  }

  toggleReaction(messageId: string, emoji: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error('Socket disconnected'));
      }
      this.socket.emit('toggle_reaction', { messageId, emoji }, (res: any) => {
        if (res?.status === 'success') {
          resolve(res);
        } else {
          reject(new Error(res?.message || 'Failed to toggle reaction'));
        }
      });
    });
  }

  onMessageReactionUpdated(): Observable<{
    messageId: string;
    reactions: MessageReaction[];
    channelId?: string;
    conversationId?: string;
    parentMessageId?: string;
  }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('message_reaction_updated', handler);
      return () => {
        this.socket?.off('message_reaction_updated', handler);
      };
    });
  }

  onUserMentioned(): Observable<{
    messageId: string;
    sender: { _id: string; name: string; profileImage?: string; email?: string };
    channelId?: string;
    channelName?: string;
    teamName?: string;
    conversationId?: string;
    parentMessageId?: string;
    content: string;
    createdAt: string | Date;
  }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('user_mentioned', handler);
      return () => {
        this.socket?.off('user_mentioned', handler);
      };
    });
  }

  // ==========================================
  // REAL-TIME TASK SOCKET EVENTS
  // ==========================================

  onTaskCreated(): Observable<{ task: any }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('task_created', handler);
      return () => {
        this.socket?.off('task_created', handler);
      };
    });
  }

  onTaskUpdated(): Observable<{ task: any }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('task_updated', handler);
      return () => {
        this.socket?.off('task_updated', handler);
      };
    });
  }

  onTaskDeleted(): Observable<{ taskId: string }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('task_deleted', handler);
      return () => {
        this.socket?.off('task_deleted', handler);
      };
    });
  }

  onTaskStatusChanged(): Observable<{ taskId: string; oldStatus: string; newStatus: string; task: any }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('task_status_changed', handler);
      return () => {
        this.socket?.off('task_status_changed', handler);
      };
    });
  }

  joinTeam(teamId: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected || !teamId) return resolve(null);
      this.socket.emit('join_team', { teamId }, (res: any) => resolve(res));
    });
  }

  leaveTeam(teamId: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected || !teamId) return resolve(null);
      this.socket.emit('leave_team', { teamId }, (res: any) => resolve(res));
    });
  }

  joinOrg(orgId: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected || !orgId) return resolve(null);
      this.socket.emit('join_org', { orgId }, (res: any) => resolve(res));
    });
  }

  leaveOrg(orgId: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected || !orgId) return resolve(null);
      this.socket.emit('leave_org', { orgId }, (res: any) => resolve(res));
    });
  }

  // ==========================================
  // NOTIFICATION SOCKET EVENTS
  // ==========================================

  onNewNotification(): Observable<{ notification: any; soundEnabled?: boolean; soundTone?: string }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('notification_new', handler);
      return () => {
        this.socket?.off('notification_new', handler);
      };
    });
  }

  onUnreadNotificationCount(): Observable<{ unreadCount: number }> {
    return new Observable((observer) => {
      if (!this.socket) return;
      const handler = (data: any) => observer.next(data);
      this.socket.on('notification_unread_count', handler);
      return () => {
        this.socket?.off('notification_unread_count', handler);
      };
    });
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
