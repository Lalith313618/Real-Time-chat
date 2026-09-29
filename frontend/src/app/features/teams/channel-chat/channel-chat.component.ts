import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ViewChild,
  ElementRef,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpEventType } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { ChannelService } from '../../../core/services/channel.service';
import { TeamService } from '../../../core/services/team.service';
import { AuthService } from '../../../core/services/auth.service';
import { SocketService } from '../../../core/services/socket.service';
import { MessageService } from '../../../core/services/message.service';
import { Channel } from '../../../core/models/channel.model';
import { Team } from '../../../core/models/team.model';
import { Message, MessageReaction } from '../../../core/models/message.model';
import { MediaUrlPipe } from '../../../core/pipes/media-url.pipe';

@Component({
  selector: 'app-channel-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MediaUrlPipe],
  templateUrl: './channel-chat.component.html',
  styleUrl: './channel-chat.component.css',
})
// Siltstone warm theme integrated
export class ChannelChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesScrollContainer') private scrollContainer?: ElementRef;
  @ViewChild('threadScrollContainer') private threadScrollContainer?: ElementRef;
  @ViewChild('channelFileInput') private channelFileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('threadFileInput') private threadFileInput?: ElementRef<HTMLInputElement>;

  readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  readonly channelService = inject(ChannelService);
  readonly messageService = inject(MessageService);
  readonly teamService = inject(TeamService);
  readonly authService = inject(AuthService);
  readonly socketService = inject(SocketService);
  readonly sanitizer = inject(DomSanitizer);

  // Mention State (@user Autocomplete & Alerts)
  mentionQuery = signal<string | null>(null);
  activeMentionContext = signal<'main' | 'thread' | null>(null);
  mentionSelectedIndex = signal<number>(0);
  selectedMentions = signal<Set<string>>(new Set());
  threadSelectedMentions = signal<Set<string>>(new Set());
  activeMentionAlert = signal<{
    sender: { _id: string; name: string; profileImage?: string; email?: string };
    channelId?: string;
    channelName?: string;
    teamName?: string;
    content: string;
    messageId: string;
  } | null>(null);

  readonly mentionCandidates = computed(() => {
    const chan = this.activeChannel();
    const list: Array<{ _id: string; name: string; email?: string; profileImage?: string; jobTitle?: string; role?: string }> = [];
    const seen = new Set<string>();

    const rawMembers = chan?.members && chan.members.length > 0 ? chan.members : (this.team()?.members || []);

    for (const m of rawMembers) {
      const u = typeof m.user === 'object' && m.user ? m.user : null;
      if (u && u._id && !seen.has(u._id)) {
        seen.add(u._id);
        list.push({
          _id: u._id,
          name: u.name,
          email: u.email,
          profileImage: u.profileImage,
          jobTitle: u.jobTitle,
          role: m.role || 'MEMBER',
        });
      }
    }
    return list;
  });

  readonly filteredMentionCandidates = computed(() => {
    const q = this.mentionQuery();
    if (q === null) return [];
    const all = this.mentionCandidates();
    if (!q.trim()) return all.slice(0, 8);
    const clean = q.toLowerCase();
    return all
      .filter((c) => c.name.toLowerCase().includes(clean) || (c.email && c.email.toLowerCase().includes(clean)))
      .slice(0, 8);
  });

  teamId = signal<string>('');
  channelId = signal<string>('');

  team = signal<Team | null>(null);
  channels = signal<Channel[]>([]);
  activeChannel = signal<Channel | null>(null);

  // Message input state
  messageText = signal<string>('');
  isSending = signal<boolean>(false);

  // Thread Drawer State
  isThreadDrawerOpen = signal<boolean>(false);
  activeThreadRootMessage = signal<Message | null>(null);
  threadReplies = signal<Message[]>([]);
  isLoadingThread = signal<boolean>(false);
  threadReplyText = signal<string>('');
  isSendingThreadReply = signal<boolean>(false);
  threadTypingUsers = signal<Map<string, string>>(new Map());
  private threadTypingTimeout: any = null;

  // Typing indicator state
  typingUsers = signal<Map<string, string>>(new Map()); // userId -> userName
  private typingTimeout: any = null;

  // Channel details drawer state
  isDetailsDrawerOpen = signal<boolean>(false);

  // File Attachment State (Main Channel)
  pendingFile = signal<File | null>(null);
  pendingFilePreview = signal<string | null>(null);
  uploadProgress = signal<number>(0);
  isUploading = signal<boolean>(false);

  // File Attachment State (Thread)
  pendingThreadFile = signal<File | null>(null);
  pendingThreadFilePreview = signal<string | null>(null);
  threadUploadProgress = signal<number>(0);
  isThreadUploading = signal<boolean>(false);

  // Channel Files Drawer State
  isFilesDrawerOpen = signal<boolean>(false);
  channelFiles = signal<Message[]>([]);
  isLoadingFiles = signal<boolean>(false);
  activeFilesFilter = signal<'all' | 'image' | 'file'>('all');
  filesTotalCount = signal<number>(0);

  // Lightbox State
  activeLightboxImage = signal<string | null>(null);
  activeLightboxFileName = signal<string | null>(null);

  // Feedback banner
  feedback = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  // Message Reactions State
  readonly QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🚀', '👀'];
  activeReactionPickerMsgId = signal<string | null>(null);

  // Subscriptions
  private subs: Subscription[] = [];
  private shouldScrollBottom = false;
  private shouldScrollThreadBottom = false;

  readonly isMyMessage = (message: Message): boolean => {
    const myId = this.authService.currentUser()?._id;
    const senderId = typeof message.sender === 'object' ? message.sender._id : message.sender;
    return Boolean(myId && senderId && myId === senderId);
  };

  readonly typingText = computed<string>(() => {
    const users = Array.from(this.typingUsers().values());
    if (users.length === 0) return '';
    if (users.length === 1) return `${users[0]} is typing...`;
    if (users.length === 2) return `${users[0]} and ${users[1]} are typing...`;
    return `${users[0]} and ${users.length - 1} others are typing...`;
  });

  readonly threadTypingText = computed<string>(() => {
    const users = Array.from(this.threadTypingUsers().values());
    if (users.length === 0) return '';
    if (users.length === 1) return `${users[0]} is typing...`;
    if (users.length === 2) return `${users[0]} and ${users[1]} are typing...`;
    return `${users[0]} and ${users.length - 1} others are typing...`;
  });

  ngOnInit(): void {
    // Connect socket if not connected
    this.socketService.connect();

    // Listen to route params
    this.subs.push(
      this.route.paramMap.subscribe((params) => {
        const tId = params.get('teamId') || '';
        const cId = params.get('channelId') || '';

        const prevChannelId = this.channelId();
        if (prevChannelId && prevChannelId !== cId) {
          this.socketService.leaveChannel(prevChannelId);
        }

        this.teamId.set(tId);
        this.channelId.set(cId);

        if (tId) {
          this.loadTeam(tId);
          this.loadChannels(tId, cId);
        }
      })
    );

    // Setup socket listeners for real-time channel messages & typing
    this.setupSocketListeners();
  }

  ngOnDestroy(): void {
    const cId = this.channelId();
    if (cId) {
      this.socketService.leaveChannel(cId);
    }
    const root = this.activeThreadRootMessage();
    if (root) {
      this.socketService.leaveThread(root._id);
    }
    this.subs.forEach((s) => s.unsubscribe());
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    if (this.threadTypingTimeout) clearTimeout(this.threadTypingTimeout);
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollBottom) {
      this.scrollToBottom();
      this.shouldScrollBottom = false;
    }
    if (this.shouldScrollThreadBottom) {
      this.scrollToThreadBottom();
      this.shouldScrollThreadBottom = false;
    }
  }

  private loadTeam(teamId: string): void {
    this.teamService.getTeamById(teamId).subscribe({
      next: (t) => this.team.set(t),
      error: () => this.showFeedback('error', 'Failed to load team info'),
    });
  }

  private loadChannels(teamId: string, targetChannelId?: string): void {
    this.channelService.loadTeamChannels(teamId).subscribe({
      next: (chans) => {
        this.channels.set(chans);
        let selected = chans.find((c) => c._id === targetChannelId);
        if (!selected && chans.length > 0) {
          selected = chans.find((c) => c.isDefault) || chans[0];
          if (selected) {
            this.router.navigate(['/teams', teamId, 'channels', selected._id], {
              replaceUrl: true,
            });
            return;
          }
        }

        if (selected) {
          this.setActiveChannel(selected);
        }
      },
      error: () => this.showFeedback('error', 'Failed to load channels'),
    });
  }

  setActiveChannel(channel: Channel): void {
    this.activeChannel.set(channel);
    this.channelService.setActiveChannel(channel);
    this.removePendingFile('main');
    this.removePendingFile('thread');

    // Join channel socket room
    this.socketService.joinChannel(channel._id);

    // Load message history
    this.channelService.loadChannelMessages(channel._id).subscribe({
      next: () => {
        this.shouldScrollBottom = true;
      },
    });

    if (this.isFilesDrawerOpen()) {
      this.loadChannelFiles(this.activeFilesFilter());
    }
  }

  switchChannel(channel: Channel): void {
    if (channel._id === this.channelId()) return;
    this.router.navigate(['/teams', this.teamId(), 'channels', channel._id]);
  }

  private setupSocketListeners(): void {
    // 1. Incoming real-time channel messages
    this.subs.push(
      this.socketService.onNewChannelMessage().subscribe((newMsg) => {
        if (newMsg.channelId === this.channelId()) {
          this.channelService.addIncomingChannelMessage(newMsg);
          this.shouldScrollBottom = true;
        }
      })
    );

    // 2. Real-time typing indicators
    this.subs.push(
      this.socketService.onChannelTypingStart().subscribe((data) => {
        if (data.channelId === this.channelId() && data.userId !== this.authService.currentUser()?._id) {
          this.typingUsers.update((map) => {
            const next = new Map(map);
            next.set(data.userId, data.userName);
            return next;
          });
        }
      })
    );

    this.subs.push(
      this.socketService.onChannelTypingStop().subscribe((data) => {
        if (data.channelId === this.channelId()) {
          this.typingUsers.update((map) => {
            const next = new Map(map);
            next.delete(data.userId);
            return next;
          });
        }
      })
    );

    // 3. Real-time message edit & delete
    this.subs.push(
      this.socketService.onChannelMessageEdited().subscribe((edited) => {
        if (edited.channelId === this.channelId()) {
          this.channelService.updateMessageInFeed(edited);
        }
      })
    );

    this.subs.push(
      this.socketService.onChannelMessageDeleted().subscribe((deleted) => {
        if (deleted.channelId === this.channelId()) {
          this.channelService.removeMessageFromFeed(deleted.messageId);
        }
      })
    );

    // 4. Real-time Thread Replies
    this.subs.push(
      this.socketService.onNewThreadReply().subscribe((reply) => {
        const root = this.activeThreadRootMessage();
        if (root && reply.parentMessageId === root._id) {
          if (!this.threadReplies().some((r) => r._id === reply._id)) {
            this.threadReplies.update((list) => [...list, reply]);
            this.shouldScrollThreadBottom = true;
          }
        }
      })
    );

    // 5. Real-time Thread Meta Update (count, last reply)
    this.subs.push(
      this.socketService.onThreadUpdated().subscribe((data) => {
        this.channelService.updateMessageThreadMeta(
          data.rootMessageId,
          data.threadCount,
          data.threadLastReplyAt
        );
        const root = this.activeThreadRootMessage();
        if (root && root._id === data.rootMessageId) {
          this.activeThreadRootMessage.update((curr) =>
            curr
              ? {
                  ...curr,
                  threadCount: data.threadCount,
                  threadLastReplyAt: data.threadLastReplyAt,
                }
              : null
          );
        }
      })
    );

    // 6. Thread Typing
    this.subs.push(
      this.socketService.onThreadTypingStart().subscribe((data) => {
        const root = this.activeThreadRootMessage();
        if (
          root &&
          data.messageId === root._id &&
          data.userId !== this.authService.currentUser()?._id
        ) {
          this.threadTypingUsers.update((map) => {
            const next = new Map(map);
            next.set(data.userId, data.userName);
            return next;
          });
        }
      })
    );

    this.subs.push(
      this.socketService.onThreadTypingStop().subscribe((data) => {
        const root = this.activeThreadRootMessage();
        if (root && data.messageId === root._id) {
          this.threadTypingUsers.update((map) => {
            const next = new Map(map);
            next.delete(data.userId);
            return next;
          });
        }
      })
    );

    // 7. Real-time Message Reactions
    this.subs.push(
      this.socketService.onMessageReactionUpdated().subscribe((data) => {
        this.applyReactionUpdate(data.messageId, data.reactions);
      })
    );

    // 8. Real-time User Mention Alerts
    this.subs.push(
      this.socketService.onUserMentioned().subscribe((alert) => {
        this.activeMentionAlert.set(alert);
        setTimeout(() => {
          if (this.activeMentionAlert()?.messageId === alert.messageId) {
            this.activeMentionAlert.set(null);
          }
        }, 7000);
      })
    );
  }

  // Handle typing input with mention detection
  onInputChange(event?: Event): void {
    const cId = this.channelId();
    if (cId) {
      this.socketService.emitChannelTypingStart(cId);
      if (this.typingTimeout) clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => {
        this.socketService.emitChannelTypingStop(cId);
      }, 2500);
    }

    const textarea = event?.target as HTMLTextAreaElement;
    if (textarea) {
      const pos = textarea.selectionStart;
      const textBefore = textarea.value.slice(0, pos);
      const match = textBefore.match(/@([a-zA-Z0-9_\-\.\s]{0,20})$/);
      if (match) {
        this.mentionQuery.set(match[1]);
        this.activeMentionContext.set('main');
        this.mentionSelectedIndex.set(0);
      } else {
        this.mentionQuery.set(null);
        this.activeMentionContext.set(null);
      }
    }
  }

  // Send message
  async sendMessage(): Promise<void> {
    const text = this.messageText().trim();
    const cId = this.channelId();
    const file = this.pendingFile();

    if ((!text && !file) || !cId || this.isSending() || this.isUploading()) return;

    this.isSending.set(true);
    this.socketService.emitChannelTypingStop(cId);
    this.closeMentionPicker();

    let fileUrl: string | undefined;
    let fileName: string | undefined;
    let fileSize: number | undefined;
    let messageType: 'text' | 'image' | 'file' = 'text';

    if (file) {
      try {
        const uploadResult = await this.uploadAttachmentFile(file, false);
        fileUrl = uploadResult.fileUrl;
        fileName = uploadResult.fileName;
        fileSize = uploadResult.fileSize;
        messageType = uploadResult.messageType;
      } catch (err: any) {
        this.isSending.set(false);
        this.showFeedback('error', 'Failed to upload attachment. Please try again.');
        return;
      }
    }

    const content = text || fileName || 'Attachment';
    const mentionList = Array.from(this.selectedMentions());

    // Prefer real-time socket emit, with HTTP fallback
    this.socketService
      .sendChannelMessage({
        channelId: cId,
        content,
        messageType,
        fileUrl,
        fileName,
        fileSize,
        mentions: mentionList,
      })
      .then((created) => {
        this.isSending.set(false);
        this.messageText.set('');
        this.selectedMentions.set(new Set());
        this.removePendingFile('main');
        this.channelService.addIncomingChannelMessage(created);
        this.shouldScrollBottom = true;
        if (file && this.isFilesDrawerOpen()) {
          this.loadChannelFiles(this.activeFilesFilter());
        }
      })
      .catch(() => {
        // Fallback to HTTP API
        this.channelService
          .sendChannelMessage(cId, {
            content,
            messageType,
            fileUrl,
            fileName,
            fileSize,
            mentions: mentionList,
          })
          .subscribe({
            next: (created) => {
              this.isSending.set(false);
              this.messageText.set('');
              this.selectedMentions.set(new Set());
              this.removePendingFile('main');
              this.shouldScrollBottom = true;
              if (file && this.isFilesDrawerOpen()) {
                this.loadChannelFiles(this.activeFilesFilter());
              }
            },
            error: (err) => {
              this.isSending.set(false);
              this.showFeedback('error', err.error?.message || 'Failed to send message');
            },
          });
      });
  }

  onKeyDown(event: KeyboardEvent): void {
    if (
      this.activeMentionContext() === 'main' &&
      this.mentionQuery() !== null &&
      this.filteredMentionCandidates().length > 0
    ) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.mentionSelectedIndex.update(
          (i) => (i + 1) % this.filteredMentionCandidates().length
        );
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.mentionSelectedIndex.update(
          (i) =>
            (i - 1 + this.filteredMentionCandidates().length) %
            this.filteredMentionCandidates().length
        );
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const candidate = this.filteredMentionCandidates()[this.mentionSelectedIndex()];
        if (candidate) this.selectMention(candidate);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeMentionPicker();
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  selectMention(candidate: any): void {
    const current = this.messageText();
    const q = this.mentionQuery() || '';
    const regex = new RegExp(`@${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    const updated = current.replace(regex, `@${candidate.name} `);
    this.messageText.set(updated);
    this.selectedMentions.update((set) => {
      const next = new Set(set);
      next.add(candidate._id);
      return next;
    });
    this.closeMentionPicker();
  }

  selectThreadMention(candidate: any): void {
    const current = this.threadReplyText();
    const q = this.mentionQuery() || '';
    const regex = new RegExp(`@${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    const updated = current.replace(regex, `@${candidate.name} `);
    this.threadReplyText.set(updated);
    this.threadSelectedMentions.update((set) => {
      const next = new Set(set);
      next.add(candidate._id);
      return next;
    });
    this.closeMentionPicker();
  }

  closeMentionPicker(): void {
    this.mentionQuery.set(null);
    this.activeMentionContext.set(null);
    this.mentionSelectedIndex.set(0);
  }

  dismissMentionAlert(): void {
    this.activeMentionAlert.set(null);
  }

  formatMessageContent(content: string): SafeHtml {
    if (!content) return '';
    const currentUserName = this.authService.currentUser()?.name;
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const highlighted = escaped.replace(
      /@([a-zA-Z0-9_\-\.\s]+?)(?=[.,!?:;]?(?:\s|$))/g,
      (match, name) => {
        const trimmed = name.trim();
        const isSelf =
          Boolean(currentUserName) && trimmed.toLowerCase() === currentUserName!.toLowerCase();
        const cls = isSelf ? 'mention-tag mention-me' : 'mention-tag';
        return `<span class="${cls}">@${trimmed}</span>`;
      }
    );

    return this.sanitizer.bypassSecurityTrustHtml(highlighted);
  }

  private scrollToBottom(): void {
    try {
      if (this.scrollContainer?.nativeElement) {
        this.scrollContainer.nativeElement.scrollTop =
          this.scrollContainer.nativeElement.scrollHeight;
      }
    } catch (e) {
      // scroll safely
    }
  }

  showFeedback(type: 'success' | 'error', text: string): void {
    this.feedback.set({ type, text });
    setTimeout(() => {
      if (this.feedback()?.text === text) {
        this.feedback.set(null);
      }
    }, 4000);
  }

  // ==========================================================================
  // THREAD ACTIONS
  // ==========================================================================

  openThread(message: Message): void {
    const currentRoot = this.activeThreadRootMessage();
    if (currentRoot && currentRoot._id !== message._id) {
      this.socketService.leaveThread(currentRoot._id);
    }

    this.activeThreadRootMessage.set(message);
    this.isThreadDrawerOpen.set(true);
    this.isDetailsDrawerOpen.set(false);
    this.threadReplyText.set('');

    this.socketService.joinThread(message._id);
    this.isLoadingThread.set(true);

    this.messageService.getThreadReplies(message._id).subscribe({
      next: (res) => {
        this.threadReplies.set(res.replies || []);
        if (res.rootMessage) {
          this.activeThreadRootMessage.set(res.rootMessage);
        }
        this.isLoadingThread.set(false);
        this.shouldScrollThreadBottom = true;
      },
      error: () => {
        this.isLoadingThread.set(false);
        this.showFeedback('error', 'Failed to load thread replies');
      },
    });
  }

  closeThread(): void {
    const currentRoot = this.activeThreadRootMessage();
    if (currentRoot) {
      this.socketService.leaveThread(currentRoot._id);
    }
    this.activeThreadRootMessage.set(null);
    this.threadReplies.set([]);
    this.isThreadDrawerOpen.set(false);
    this.threadReplyText.set('');
    this.closeMentionPicker();
  }

  onThreadInputChange(event?: Event): void {
    const root = this.activeThreadRootMessage();
    if (root) {
      this.socketService.emitThreadTypingStart(root._id);
      if (this.threadTypingTimeout) clearTimeout(this.threadTypingTimeout);
      this.threadTypingTimeout = setTimeout(() => {
        this.socketService.emitThreadTypingStop(root._id);
      }, 2500);
    }

    const textarea = event?.target as HTMLTextAreaElement;
    if (textarea) {
      const pos = textarea.selectionStart;
      const textBefore = textarea.value.slice(0, pos);
      const match = textBefore.match(/@([a-zA-Z0-9_\-\.\s]{0,20})$/);
      if (match) {
        this.mentionQuery.set(match[1]);
        this.activeMentionContext.set('thread');
        this.mentionSelectedIndex.set(0);
      } else {
        this.mentionQuery.set(null);
        this.activeMentionContext.set(null);
      }
    }
  }

  async sendThreadReply(): Promise<void> {
    const text = this.threadReplyText().trim();
    const root = this.activeThreadRootMessage();
    const file = this.pendingThreadFile();

    if ((!text && !file) || !root || this.isSendingThreadReply() || this.isThreadUploading()) return;

    this.isSendingThreadReply.set(true);
    this.socketService.emitThreadTypingStop(root._id);
    this.closeMentionPicker();

    let fileUrl: string | undefined;
    let fileName: string | undefined;
    let fileSize: number | undefined;
    let messageType: 'text' | 'image' | 'file' = 'text';

    if (file) {
      try {
        const uploadResult = await this.uploadAttachmentFile(file, true);
        fileUrl = uploadResult.fileUrl;
        fileName = uploadResult.fileName;
        fileSize = uploadResult.fileSize;
        messageType = uploadResult.messageType;
      } catch (err: any) {
        this.isSendingThreadReply.set(false);
        this.showFeedback('error', 'Failed to upload attachment in thread');
        return;
      }
    }

    const content = text || fileName || 'Attachment';
    const threadMentionList = Array.from(this.threadSelectedMentions());

    this.socketService
      .sendThreadReply({
        messageId: root._id,
        content,
        messageType,
        fileUrl,
        fileName,
        fileSize,
        mentions: threadMentionList,
      })
      .then((res) => {
        const reply = res.reply || res;
        this.isSendingThreadReply.set(false);
        this.threadReplyText.set('');
        this.threadSelectedMentions.set(new Set());
        this.removePendingFile('thread');
        if (reply && !this.threadReplies().some((r) => r._id === reply._id)) {
          this.threadReplies.update((list) => [...list, reply]);
        }
        this.shouldScrollThreadBottom = true;

        const newCount = (root.threadCount || 0) + 1;
        const nowIso = new Date().toISOString();
        this.activeThreadRootMessage.update((curr) =>
          curr ? { ...curr, threadCount: newCount, threadLastReplyAt: nowIso } : null
        );
        this.channelService.updateMessageThreadMeta(root._id, newCount, nowIso);
        if (file && this.isFilesDrawerOpen()) {
          this.loadChannelFiles(this.activeFilesFilter());
        }
      })
      .catch(() => {
        // Fallback to HTTP
        this.messageService
          .sendThreadReply(root._id, content, {
            messageType,
            fileUrl,
            fileName,
            fileSize,
            mentions: threadMentionList,
          })
          .subscribe({
            next: (res) => {
              this.isSendingThreadReply.set(false);
              this.threadReplyText.set('');
              this.threadSelectedMentions.set(new Set());
              this.removePendingFile('thread');
              if (!this.threadReplies().some((r) => r._id === res.reply._id)) {
                this.threadReplies.update((list) => [...list, res.reply]);
              }
              if (res.rootMessage) {
                this.activeThreadRootMessage.set(res.rootMessage);
                this.channelService.updateMessageInFeed(res.rootMessage);
              }
              this.shouldScrollThreadBottom = true;
              if (file && this.isFilesDrawerOpen()) {
                this.loadChannelFiles(this.activeFilesFilter());
              }
            },
            error: (err) => {
              this.isSendingThreadReply.set(false);
              this.showFeedback('error', err.error?.message || 'Failed to send thread reply');
            },
          });
      });
  }

  onThreadKeyDown(event: KeyboardEvent): void {
    if (
      this.activeMentionContext() === 'thread' &&
      this.mentionQuery() !== null &&
      this.filteredMentionCandidates().length > 0
    ) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.mentionSelectedIndex.update(
          (i) => (i + 1) % this.filteredMentionCandidates().length
        );
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.mentionSelectedIndex.update(
          (i) =>
            (i - 1 + this.filteredMentionCandidates().length) %
            this.filteredMentionCandidates().length
        );
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const candidate = this.filteredMentionCandidates()[this.mentionSelectedIndex()];
        if (candidate) this.selectThreadMention(candidate);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeMentionPicker();
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendThreadReply();
    }
  }

  private scrollToThreadBottom(): void {
    try {
      if (this.threadScrollContainer?.nativeElement) {
        this.threadScrollContainer.nativeElement.scrollTop =
          this.threadScrollContainer.nativeElement.scrollHeight;
      }
    } catch (e) {
      // scroll safely
    }
  }

  // ==========================================================================
  // MESSAGE REACTION ACTIONS
  // ==========================================================================

  hasUserReacted(reaction: MessageReaction): boolean {
    const myId = this.authService.currentUser()?._id;
    if (!myId || !reaction.users) return false;
    return reaction.users.some((u) => {
      const uId = typeof u === 'object' ? u._id : u;
      return uId === myId;
    });
  }

  getReactionTooltip(reaction: MessageReaction): string {
    const names = (reaction.users || []).map((u) => {
      if (typeof u === 'object') return u.name;
      return 'Teammate';
    });
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    if (names.length <= 3) return names.join(', ');
    return `${names.slice(0, 3).join(', ')} and ${names.length - 3} others`;
  }

  toggleReactionPicker(messageId: string, event?: Event): void {
    if (event) event.stopPropagation();
    if (this.activeReactionPickerMsgId() === messageId) {
      this.activeReactionPickerMsgId.set(null);
    } else {
      this.activeReactionPickerMsgId.set(messageId);
    }
  }

  closeReactionPicker(): void {
    this.activeReactionPickerMsgId.set(null);
  }

  toggleReaction(message: Message, emoji: string): void {
    if (!message || !message._id) return;
    this.closeReactionPicker();

    // Prefer Socket, fallback to HTTP
    this.socketService
      .toggleReaction(message._id, emoji)
      .then((res) => {
        if (res?.reactions) {
          this.applyReactionUpdate(message._id, res.reactions);
        }
      })
      .catch(() => {
        this.messageService.toggleReaction(message._id, emoji).subscribe({
          next: (res) => {
            if (res?.reactions) {
              this.applyReactionUpdate(message._id, res.reactions);
            }
          },
          error: (err) => {
            this.showFeedback('error', err.error?.message || 'Failed to update reaction');
          },
        });
      });
  }

  private applyReactionUpdate(messageId: string, reactions: MessageReaction[]): void {
    // 1. In active channel messages feed
    this.channelService.updateMessageReactions(messageId, reactions);

    // 2. In active thread root message
    const root = this.activeThreadRootMessage();
    if (root && root._id === messageId) {
      this.activeThreadRootMessage.update((curr) => (curr ? { ...curr, reactions } : null));
    }

    // 3. In thread replies list
    this.threadReplies.update((replies) =>
      replies.map((r) => (r._id === messageId ? { ...r, reactions } : r))
    );
  }

  // ==========================================================================
  // FILE ATTACHMENTS & CHANNEL FILES ACTIONS
  // ==========================================================================

  triggerFileInput(context: 'main' | 'thread'): void {
    if (context === 'main') {
      this.channelFileInput?.nativeElement?.click();
    } else {
      this.threadFileInput?.nativeElement?.click();
    }
  }

  onFileSelected(event: Event, context: 'main' | 'thread'): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      this.showFeedback('error', 'File size exceeds maximum limit of 50MB');
      input.value = '';
      return;
    }

    if (context === 'main') {
      this.pendingFile.set(file);
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => this.pendingFilePreview.set(e.target?.result as string);
        reader.readAsDataURL(file);
      } else {
        this.pendingFilePreview.set(null);
      }
    } else {
      this.pendingThreadFile.set(file);
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => this.pendingThreadFilePreview.set(e.target?.result as string);
        reader.readAsDataURL(file);
      } else {
        this.pendingThreadFilePreview.set(null);
      }
    }
  }

  removePendingFile(context: 'main' | 'thread'): void {
    if (context === 'main') {
      this.pendingFile.set(null);
      this.pendingFilePreview.set(null);
      this.uploadProgress.set(0);
      this.isUploading.set(false);
      if (this.channelFileInput?.nativeElement) {
        this.channelFileInput.nativeElement.value = '';
      }
    } else {
      this.pendingThreadFile.set(null);
      this.pendingThreadFilePreview.set(null);
      this.threadUploadProgress.set(0);
      this.isThreadUploading.set(false);
      if (this.threadFileInput?.nativeElement) {
        this.threadFileInput.nativeElement.value = '';
      }
    }
  }

  private uploadAttachmentFile(
    file: File,
    isThread = false
  ): Promise<{ fileUrl: string; fileName: string; fileSize: number; messageType: 'image' | 'file' }> {
    return new Promise((resolve, reject) => {
      if (isThread) {
        this.isThreadUploading.set(true);
        this.threadUploadProgress.set(0);
      } else {
        this.isUploading.set(true);
        this.uploadProgress.set(0);
      }

      this.messageService.uploadAttachment(file).subscribe({
        next: (httpEvent) => {
          if (httpEvent.type === HttpEventType.UploadProgress && httpEvent.total) {
            const percent = Math.round((httpEvent.loaded / httpEvent.total) * 100);
            if (isThread) {
              this.threadUploadProgress.set(percent);
            } else {
              this.uploadProgress.set(percent);
            }
          } else if (httpEvent.type === HttpEventType.Response) {
            const body = httpEvent.body;
            if (body && body.file) {
              const fileData = body.file;
              const isImg = file.type.startsWith('image/') || fileData.resourceType === 'image';
              resolve({
                fileUrl: fileData.fileUrl,
                fileName: fileData.fileName || file.name,
                fileSize: fileData.fileSize || file.size,
                messageType: isImg ? 'image' : 'file',
              });
            } else {
              reject(new Error('Invalid upload response'));
            }
          }
        },
        error: (err) => {
          if (isThread) {
            this.isThreadUploading.set(false);
          } else {
            this.isUploading.set(false);
          }
          reject(err);
        },
        complete: () => {
          if (isThread) {
            this.isThreadUploading.set(false);
          } else {
            this.isUploading.set(false);
          }
        },
      });
    });
  }

  formatFileSize(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  getFileIcon(fileName?: string, messageType?: string): string {
    if (messageType === 'image') return '🖼️';
    if (!fileName) return '📄';
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf': return '📕';
      case 'doc':
      case 'docx': return '📘';
      case 'xls':
      case 'xlsx':
      case 'csv': return '📗';
      case 'ppt':
      case 'pptx': return '📙';
      case 'zip':
      case 'rar':
      case '7z':
      case 'tar':
      case 'gz': return '📦';
      case 'mp3':
      case 'wav':
      case 'ogg': return '🎵';
      case 'mp4':
      case 'mov':
      case 'avi':
      case 'webm': return '🎥';
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'webp': return '🖼️';
      case 'txt':
      case 'md': return '📝';
      default: return '📄';
    }
  }

  toggleFilesDrawer(): void {
    const nextState = !this.isFilesDrawerOpen();
    this.isFilesDrawerOpen.set(nextState);
    if (nextState) {
      this.isDetailsDrawerOpen.set(false);
      this.loadChannelFiles(this.activeFilesFilter());
    }
  }

  loadChannelFiles(filter?: 'all' | 'image' | 'file'): void {
    const cId = this.channelId();
    if (!cId) return;

    const f = filter || this.activeFilesFilter();
    this.isLoadingFiles.set(true);

    this.channelService.getChannelFiles(cId, f).subscribe({
      next: (res) => {
        this.channelFiles.set(res.files || []);
        this.filesTotalCount.set(res.total || res.results || 0);
        this.isLoadingFiles.set(false);
      },
      error: () => {
        this.isLoadingFiles.set(false);
        this.showFeedback('error', 'Failed to load channel files');
      },
    });
  }

  setFilesFilter(filter: 'all' | 'image' | 'file'): void {
    this.activeFilesFilter.set(filter);
    this.loadChannelFiles(filter);
  }

  openLightbox(fileUrl: string, fileName?: string): void {
    if (!fileUrl) return;
    this.activeLightboxImage.set(fileUrl);
    this.activeLightboxFileName.set(fileName || 'Image');
  }

  closeLightbox(): void {
    this.activeLightboxImage.set(null);
    this.activeLightboxFileName.set(null);
  }
}

