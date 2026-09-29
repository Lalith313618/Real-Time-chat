import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Channel,
  CreateChannelDto,
  UpdateChannelDto,
  AddChannelMemberDto,
} from '../models/channel.model';
import { Message, MessageReaction } from '../models/message.model';
import { resolveMediaUrl } from '../utils/media-url.util';

@Injectable({
  providedIn: 'root',
})
export class ChannelService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/channels`;

  // Reactive state signals
  readonly channels = signal<Channel[]>([]);
  readonly activeChannel = signal<Channel | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly activeChannelMessages = signal<Message[]>([]);
  readonly isLoadingMessages = signal<boolean>(false);

  // Computed state
  readonly publicChannels = computed<Channel[]>(() =>
    this.channels().filter((c) => c.type === 'PUBLIC')
  );

  readonly privateChannels = computed<Channel[]>(() =>
    this.channels().filter((c) => c.type === 'PRIVATE')
  );

  readonly isChannelAdmin = computed<boolean>(() => {
    return this.activeChannel()?.myRole === 'ADMIN';
  });

  private normalizeChannel(channel: Channel): Channel {
    if (!channel) return channel;
    return {
      ...channel,
      members: (channel.members || []).map((m) => {
        if (m.user && typeof m.user === 'object') {
          return {
            ...m,
            user: {
              ...m.user,
              profileImage: m.user.profileImage ? resolveMediaUrl(m.user.profileImage) : '',
            },
          };
        }
        return m;
      }),
    };
  }

  loadTeamChannels(teamId: string): Observable<Channel[]> {
    this.isLoading.set(true);
    return this.http
      .get<{ status: string; results: number; channels: Channel[] }>(this.apiUrl, {
        params: { teamId },
      })
      .pipe(
        map((res) => (res.channels || []).map((c) => this.normalizeChannel(c))),
        tap((channels) => {
          this.channels.set(channels);
          this.isLoading.set(false);
          // If no active channel or active channel not in this list, default to first or general channel
          const currentActive = this.activeChannel();
          if (!currentActive || !channels.some((c) => c._id === currentActive._id)) {
            const general = channels.find((c) => c.isDefault) || channels[0] || null;
            this.activeChannel.set(general);
          }
        })
      );
  }

  getChannelById(channelId: string): Observable<Channel> {
    this.isLoading.set(true);
    return this.http
      .get<{ status: string; channel: Channel }>(`${this.apiUrl}/${channelId}`)
      .pipe(
        map((res) => this.normalizeChannel(res.channel)),
        tap((channel) => {
          this.activeChannel.set(channel);
          this.isLoading.set(false);
        })
      );
  }

  createChannel(dto: CreateChannelDto): Observable<Channel> {
    this.isLoading.set(true);
    return this.http
      .post<{ status: string; channel: Channel }>(this.apiUrl, dto)
      .pipe(
        map((res) => this.normalizeChannel(res.channel)),
        tap((newChannel) => {
          this.channels.update((list) => [...list, newChannel]);
          this.activeChannel.set(newChannel);
          this.isLoading.set(false);
        })
      );
  }

  updateChannel(id: string, dto: UpdateChannelDto): Observable<Channel> {
    return this.http
      .put<{ status: string; channel: Channel }>(`${this.apiUrl}/${id}`, dto)
      .pipe(
        map((res) => this.normalizeChannel(res.channel)),
        tap((updatedChannel) => {
          this.channels.update((list) =>
            list.map((c) => (c._id === id ? updatedChannel : c))
          );
          if (this.activeChannel()?._id === id) {
            this.activeChannel.set(updatedChannel);
          }
        })
      );
  }

  deleteChannel(id: string): Observable<{ status: string; message: string }> {
    return this.http
      .delete<{ status: string; message: string }>(`${this.apiUrl}/${id}`)
      .pipe(
        tap(() => {
          this.channels.update((list) => list.filter((c) => c._id !== id));
          if (this.activeChannel()?._id === id) {
            const remaining = this.channels();
            this.activeChannel.set(remaining.find((c) => c.isDefault) || remaining[0] || null);
          }
        })
      );
  }

  addMember(channelId: string, dto: AddChannelMemberDto): Observable<Channel> {
    return this.http
      .post<{ status: string; channel: Channel }>(
        `${this.apiUrl}/${channelId}/members`,
        dto
      )
      .pipe(
        map((res) => this.normalizeChannel(res.channel)),
        tap((updated) => {
          this.channels.update((list) =>
            list.map((c) => (c._id === channelId ? updated : c))
          );
          if (this.activeChannel()?._id === channelId) {
            this.activeChannel.set(updated);
          }
        })
      );
  }

  removeMember(channelId: string, memberId: string): Observable<Channel> {
    return this.http
      .delete<{ status: string; channel: Channel }>(
        `${this.apiUrl}/${channelId}/members/${memberId}`
      )
      .pipe(
        map((res) => this.normalizeChannel(res.channel)),
        tap((updated) => {
          this.channels.update((list) =>
            list.map((c) => (c._id === channelId ? updated : c))
          );
          if (this.activeChannel()?._id === channelId) {
            this.activeChannel.set(updated);
          }
        })
      );
  }

  setActiveChannel(channel: Channel): void {
    this.activeChannel.set(channel);
  }

  loadChannelMessages(channelId: string, page = 1, limit = 50): Observable<{ messages: Message[]; total: number; page: number; totalPages: number }> {
    this.isLoadingMessages.set(true);
    return this.http
      .get<{ status: string; messages: Message[]; total: number; page: number; totalPages: number }>(
        `${this.apiUrl}/${channelId}/messages`,
        { params: { page: page.toString(), limit: limit.toString() } }
      )
      .pipe(
        tap((res) => {
          this.activeChannelMessages.set(res.messages || []);
          this.isLoadingMessages.set(false);
        })
      );
  }

  sendChannelMessage(
    channelId: string,
    dto: {
      content: string;
      messageType?: string;
      fileUrl?: string;
      fileName?: string;
      fileSize?: number;
      replyTo?: string | null;
      mentions?: string[];
    }
  ): Observable<Message> {
    return this.http
      .post<{ status: string; message: Message }>(
        `${this.apiUrl}/${channelId}/messages`,
        dto
      )
      .pipe(
        map((res) => res.message),
        tap((newMsg) => {
          this.addIncomingChannelMessage(newMsg);
        })
      );
  }

  addIncomingChannelMessage(message: Message): void {
    const list = this.activeChannelMessages();
    if (!list.some((m) => m._id === message._id)) {
      this.activeChannelMessages.set([...list, message]);
    }
  }

  updateMessageInFeed(updated: Message): void {
    this.activeChannelMessages.update((list) =>
      list.map((m) => (m._id === updated._id ? updated : m))
    );
  }

  updateMessageThreadMeta(messageId: string, threadCount: number, threadLastReplyAt?: string | Date): void {
    const lastReplyStr = threadLastReplyAt instanceof Date
      ? threadLastReplyAt.toISOString()
      : (threadLastReplyAt || undefined);

    this.activeChannelMessages.update((list) =>
      list.map((m) =>
        m._id === messageId
          ? {
              ...m,
              threadCount,
              threadLastReplyAt: lastReplyStr || m.threadLastReplyAt,
            }
          : m
      )
    );
  }

  updateMessageReactions(messageId: string, reactions: MessageReaction[]): void {
    this.activeChannelMessages.update((list) =>
      list.map((m) =>
        m._id === messageId
          ? {
              ...m,
              reactions,
            }
          : m
      )
    );
  }

  removeMessageFromFeed(messageId: string): void {
    this.activeChannelMessages.update((list) =>
      list.filter((m) => m._id !== messageId)
    );
  }

  getChannelFiles(
    channelId: string,
    type?: string,
    page: number = 1,
    limit: number = 50
  ): Observable<{ status: string; results: number; total: number; files: Message[] }> {
    let params: any = { page, limit };
    if (type && type !== 'all') {
      params.type = type;
    }
    return this.http.get<{ status: string; results: number; total: number; files: Message[] }>(
      `${this.apiUrl}/${channelId}/files`,
      { params }
    );
  }

  clearChannels(): void {
    this.channels.set([]);
    this.activeChannel.set(null);
    this.activeChannelMessages.set([]);
  }
}

