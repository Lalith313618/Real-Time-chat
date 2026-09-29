import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ViewChild,
  ElementRef,
  AfterViewChecked
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpEventType } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ConversationService } from '../../core/services/conversation.service';
import { MessageService } from '../../core/services/message.service';
import { SocketService } from '../../core/services/socket.service';
import { UserService } from '../../core/services/user.service';
import { Conversation } from '../../core/models/conversation.model';
import { Message, MessageType } from '../../core/models/message.model';
import { User } from '../../core/models/user.model';
import { NetworkService } from '../../core/services/network.service';
import { ImageLightboxComponent } from './components/image-lightbox/image-lightbox.component';
import { SearchDrawerComponent } from './components/search-drawer/search-drawer.component';
import { CreateGroupModalComponent } from './components/create-group-modal/create-group-modal.component';
import { GroupInfoDrawerComponent } from './components/group-info-drawer/group-info-drawer.component';
import { UserInfoDrawerComponent } from './components/user-info-drawer/user-info-drawer.component';
import { ChatSidebarComponent } from './components/chat-sidebar/chat-sidebar.component';
import { ChatHeaderComponent } from './components/chat-header/chat-header.component';
import { ChatInputBarComponent } from './components/chat-input-bar/chat-input-bar.component';
import { ChatMessageFeedComponent } from './components/chat-message-feed/chat-message-feed.component';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ImageLightboxComponent,
    SearchDrawerComponent,
    CreateGroupModalComponent,
    GroupInfoDrawerComponent,
    UserInfoDrawerComponent,
    ChatSidebarComponent,
    ChatHeaderComponent,
    ChatInputBarComponent,
    ChatMessageFeedComponent
  ],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css'
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  readonly authService = inject(AuthService);
  readonly conversationService = inject(ConversationService);
  readonly messageService = inject(MessageService);
  readonly socketService = inject(SocketService);
  readonly userService = inject(UserService);
  readonly networkService = inject(NetworkService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // Mobile Touch Gestures (Phase 15)
  private touchStartX = 0;
  private touchStartY = 0;

  @ViewChild('messageFeed') private messageFeed?: ChatMessageFeedComponent;
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('fileInput') private fileInputRef!: ElementRef<HTMLInputElement>;

  // State Signals
  conversations = signal<Conversation[]>([]);
  activeConversation = signal<Conversation | null>(null);
  messages = signal<Message[]>([]);
  conversationFilter = signal<string>('');

  // File Upload State Signals (Phase 12)
  selectedFile = signal<File | null>(null);
  filePreviewUrl = signal<string | null>(null);
  uploadProgress = signal<number>(0);
  isUploading = signal<boolean>(false);
  uploadError = signal<string>('');
  uploadedFileData = signal<{
    fileUrl: string;
    fileName: string;
    fileSize: number;
    resourceType: string;
  } | null>(null);
  previewLightboxImage = signal<string | null>(null);

  // Audio Playback State Signals
  activeAudioMessageId = signal<string | null>(null);
  audioCurrentTimeMap = signal<Record<string, number>>({});
  audioDurationMap = signal<Record<string, number>>({});

  private currentAudioElement: HTMLAudioElement | null = null;

  // Group Management State Signals
  isCreateGroupOpen = signal<boolean>(false);
  newGroupName = signal<string>('');
  selectedGroupMembers = signal<string[]>([]);
  allUsersList = signal<User[]>([]);
  isCreatingGroup = signal<boolean>(false);
  createGroupError = signal<string>('');
  userFilterInGroupModal = signal<string>('');

  // Group Info / Member Settings Drawer State
  isGroupInfoOpen = signal<boolean>(false);
  isEditingGroupName = signal<boolean>(false);
  editGroupNameInput = signal<string>('');
  isAddingMemberOpen = signal<boolean>(false);
  memberToAddSearch = signal<string>('');
  groupActionLoading = signal<boolean>(false);
  groupActionMessage = signal<string>('');

  // User Profile Drawer State (Direct Chat)
  isUserProfileOpen = signal<boolean>(false);

  // Message Search State
  isSearchOpen = signal<boolean>(false);
  searchQuery = signal<string>('');
  searchResults = signal<Message[]>([]);
  currentResultIndex = signal<number>(0);
  isSearching = signal<boolean>(false);

  // Composer state
  messageInput = signal<string>('');
  editingMessage = signal<Message | null>(null);
  replyingTo = signal<Message | null>(null);

  isLoadingConversations = signal<boolean>(false);
  isLoadingMessages = signal<boolean>(false);
  isSending = signal<boolean>(false);

  // Presence and typing state
  readonly lastSeenMap = signal<Record<string, string | Date>>({});
  readonly typingUsers = signal<Map<string, string>>(new Map());
  private typingTimeout: any = null;
  private isCurrentlyTyping = false;

  // Auto-scroll control
  private shouldScrollBottom = false;
  private sub = new Subscription();

  // Computed typing text for currently active chat
  readonly typingIndicatorText = computed(() => {
    const names = Array.from(this.typingUsers().values());
    if (names.length === 0) return '';
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    return 'Several people are typing...';
  });

  // Filtered conversations computed
  filteredConversations = computed(() => {
    const q = this.conversationFilter().toLowerCase().trim();
    const list = this.conversations();
    if (!q) return list;

    return list.filter((conv) => {
      if (conv.isGroup) {
        return conv.groupName?.toLowerCase().includes(q);
      }
      const other = this.getOtherParticipant(conv);
      return (
        other?.name.toLowerCase().includes(q) ||
        other?.email.toLowerCase().includes(q)
      );
    });
  });

  // Filtered users for create group modal
  filteredUsersForGroup = computed(() => {
    const q = this.userFilterInGroupModal().toLowerCase().trim();
    const currentId = this.authService.currentUser()?._id;
    const all = this.allUsersList().filter((u) => u._id !== currentId);
    if (!q) return all;
    return all.filter(
      (u) =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  });

  // Available users to add into existing group
  availableUsersToAdd = computed(() => {
    const conv = this.activeConversation();
    if (!conv || !conv.isGroup) return [];
    const currentParticipants = new Set(
      conv.participants.map((p) => (typeof p === 'string' ? p : p._id))
    );
    const q = this.memberToAddSearch().toLowerCase().trim();
    return this.allUsersList().filter((u) => {
      if (currentParticipants.has(u._id)) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    });
  });

  ngOnInit(): void {
    // 1. Ensure Socket is connected with auth token
    this.socketService.connect(this.authService.token() || undefined);

    // 2. Load conversations
    this.loadConversations();

    // 3. Setup real-time Socket.IO event listeners
    this.setupSocketListeners();

    // 4. Check for route param :id
    this.sub.add(
      this.route.params.subscribe((params) => {
        const convId = params['id'];
        if (convId && convId !== this.activeConversation()?._id) {
          this.loadConversationById(convId);
        }
      })
    );
  }

  private setupSocketListeners(): void {
    // Real-time incoming message
    this.sub.add(
      this.socketService.onNewMessage().subscribe((newMsg) => {
        const activeConv = this.activeConversation();
        const currentUserId = this.authService.currentUser()?._id;
        const senderId = typeof newMsg.sender === 'string' ? newMsg.sender : newMsg.sender?._id;
        const isFromOther = senderId !== currentUserId;

        if (activeConv && newMsg.conversationId === activeConv._id) {
          // Check for duplicate
          const exists = this.messages().some((m) => m._id === newMsg._id);
          if (!exists) {
            this.messages.update((list) => [...list, newMsg]);
            this.shouldScrollBottom = true;
          }
          // Mark immediately read
          this.socketService.emitMarkRead(activeConv._id);
          this.messageService.markAllAsRead(activeConv._id).subscribe();
        } else {
          // Increment unread count for other conversations
          this.conversations.update((list) =>
            list.map((c) =>
              c._id === newMsg.conversationId
                ? { ...c, unreadCount: (c.unreadCount || 0) + 1 }
                : c
            )
          );
        }

        // Update preview in sidebar and move conversation to top
        if (newMsg.conversationId) {
          this.updateConversationSidebar(newMsg.conversationId, newMsg.content || '[Attachment]');
        }
      })
    );

    // Real-time edited message
    this.sub.add(
      this.socketService.onMessageEdited().subscribe((editedMsg) => {
        this.messages.update((list) =>
          list.map((m) => (m._id === editedMsg._id ? editedMsg : m))
        );
      })
    );

    // Real-time deleted message
    this.sub.add(
      this.socketService.onMessageDeleted().subscribe((delData) => {
        this.messages.update((list) =>
          list.map((m) =>
            m._id === delData.messageId
              ? { ...m, isDeleted: true, content: 'This message was deleted' }
              : m
          )
        );
      })
    );

    // Real-time conversation update
    this.sub.add(
      this.socketService.onConversationUpdated().subscribe((data) => {
        this.updateConversationSidebar(data.conversationId, data.lastMessage);
      })
    );

    // Real-time presence: user online
    this.sub.add(
      this.socketService.onUserOnline().subscribe((data) => {
        // Updated in socketService.onlineUsers signal automatically
      })
    );

    // Real-time presence: user offline
    this.sub.add(
      this.socketService.onUserOffline().subscribe((data) => {
        if (data.userId && data.lastSeen) {
          this.lastSeenMap.update((m) => ({ ...m, [data.userId]: data.lastSeen }));
        }
      })
    );

    // Real-time typing start
    this.sub.add(
      this.socketService.onTypingStart().subscribe((data) => {
        const activeConv = this.activeConversation();
        const currentUserId = this.authService.currentUser()?._id;
        if (activeConv && data.conversationId === activeConv._id && data.userId !== currentUserId) {
          this.typingUsers.update((map) => {
            const next = new Map(map);
            next.set(data.userId, data.userName || 'User');
            return next;
          });
          this.shouldScrollBottom = true;
        }
      })
    );

    // Real-time typing stop
    this.sub.add(
      this.socketService.onTypingStop().subscribe((data) => {
        const activeConv = this.activeConversation();
        if (activeConv && data.conversationId === activeConv._id) {
          this.typingUsers.update((map) => {
            const next = new Map(map);
            next.delete(data.userId);
            return next;
          });
        }
      })
    );

    // Real-time messages read receipt (turns ticks blue)
    this.sub.add(
      this.socketService.onMessagesRead().subscribe((data) => {
        const activeConv = this.activeConversation();
        if (activeConv && data.conversationId === activeConv._id) {
          this.messages.update((list) =>
            list.map((m) => {
              const readBy = m.readBy || [];
              const alreadyIn = readBy.some(
                (id) => (typeof id === 'string' ? id : id._id) === data.readerId
              );
              if (!alreadyIn) {
                return { ...m, readBy: [...readBy, data.readerId] };
              }
              return m;
            })
          );
        }
      })
    );

    // Real-time messages delivered receipt (turns single tick to double tick)
    this.sub.add(
      this.socketService.onMessagesDelivered().subscribe((data) => {
        const activeConv = this.activeConversation();
        if (activeConv && data.conversationId === activeConv._id) {
          this.messages.update((list) =>
            list.map((m) => {
              const deliveredTo = m.deliveredTo || [];
              const alreadyIn = deliveredTo.some(
                (id) => (typeof id === 'string' ? id : id._id) === data.userId
              );
              if (!alreadyIn) {
                return { ...m, deliveredTo: [...deliveredTo, data.userId] };
              }
              return m;
            })
          );
        }
      })
    );

    // Real-time unread cleared notification
    this.sub.add(
      this.socketService.onUnreadCleared().subscribe((data) => {
        this.conversations.update((list) =>
          list.map((c) => (c._id === data.conversationId ? { ...c, unreadCount: 0 } : c))
        );
      })
    );

    // Real-time chat history cleared
    this.sub.add(
      this.socketService.onChatCleared().subscribe((data) => {
        const activeConv = this.activeConversation();
        if (activeConv && data.conversationId === activeConv._id) {
          this.messages.set([]);
        }
        this.conversations.update((list) =>
          list.map((c) => (c._id === data.conversationId ? { ...c, lastMessage: '' } : c))
        );
      })
    );

    // Real-time group created / added
    this.sub.add(
      this.socketService.onGroupCreated().subscribe((groupConv) => {
        this.conversations.update((list) => {
          const exists = list.some((c) => c._id === groupConv._id);
          return exists ? list : [groupConv, ...list];
        });
      })
    );

    // Real-time group updated
    this.sub.add(
      this.socketService.onGroupUpdated().subscribe((updatedConv) => {
        this.conversations.update((list) =>
          list.map((c) => (c._id === updatedConv._id ? { ...c, ...updatedConv } : c))
        );
        if (this.activeConversation()?._id === updatedConv._id) {
          this.activeConversation.set(updatedConv);
        }
      })
    );

    // Real-time member added
    this.sub.add(
      this.socketService.onMemberAdded().subscribe((data) => {
        const updated = data.conversation;
        this.conversations.update((list) =>
          list.map((c) => (c._id === updated._id ? { ...c, ...updated } : c))
        );
        if (this.activeConversation()?._id === updated._id) {
          this.activeConversation.set(updated);
        }
      })
    );

    // Real-time member removed
    this.sub.add(
      this.socketService.onMemberRemoved().subscribe((data) => {
        const currentUserId = this.authService.currentUser()?._id;
        if (data.memberId === currentUserId) {
          this.conversations.update((list) => list.filter((c) => c._id !== data.conversationId));
          if (this.activeConversation()?._id === data.conversationId) {
            this.activeConversation.set(null);
            this.closeGroupInfo();
          }
        } else {
          this.conversations.update((list) =>
            list.map((c) => (c._id === data.conversationId ? { ...c, ...data.conversation } : c))
          );
          if (this.activeConversation()?._id === data.conversationId) {
            this.activeConversation.set(data.conversation);
          }
        }
      })
    );

    // Real-time member left group
    this.sub.add(
      this.socketService.onGroupLeft().subscribe((data) => {
        const currentUserId = this.authService.currentUser()?._id;
        if (data.userId === currentUserId) {
          this.conversations.update((list) => list.filter((c) => c._id !== data.conversationId));
          if (this.activeConversation()?._id === data.conversationId) {
            this.activeConversation.set(null);
            this.closeGroupInfo();
          }
        } else {
          this.conversations.update((list) =>
            list.map((c) => (c._id === data.conversationId ? { ...c, ...data.conversation } : c))
          );
          if (this.activeConversation()?._id === data.conversationId) {
            this.activeConversation.set(data.conversation);
          }
        }
      })
    );

    // Real-time group removed
    this.sub.add(
      this.socketService.onGroupRemoved().subscribe((data) => {
        this.conversations.update((list) => list.filter((c) => c._id !== data.conversationId));
        if (this.activeConversation()?._id === data.conversationId) {
          this.activeConversation.set(null);
          this.closeGroupInfo();
        }
      })
    );
  }

  private updateConversationSidebar(conversationId: string, lastMessage: string): void {
    this.conversations.update((list) => {
      const index = list.findIndex((c) => c._id === conversationId);
      if (index > -1) {
        const updated = [...list];
        const target = {
          ...updated[index],
          lastMessage,
          lastMessageAt: new Date()
        };
        updated.splice(index, 1);
        return [target, ...updated];
      }
      return list;
    });
  }

  loadConversations(): void {
    this.isLoadingConversations.set(true);
    this.conversationService.getUserConversations().subscribe({
      next: (list) => {
        this.conversations.set(list);
        this.isLoadingConversations.set(false);

        const routeId = this.route.snapshot.params['id'];
        const isMobileScreen = typeof window !== 'undefined' && window.innerWidth <= 768;
        if (!routeId && list.length > 0 && !this.activeConversation() && !isMobileScreen) {
          this.selectConversation(list[0]);
        }
      },
      error: (err) => {
        console.error('Failed to load conversations:', err);
        this.isLoadingConversations.set(false);
      }
    });
  }

  loadConversationById(id: string): void {
    this.conversationService.getConversationById(id).subscribe({
      next: (conv) => {
        this.selectConversation(conv, false);
      },
      error: (err) => {
        console.error('Failed to fetch conversation by ID:', err);
      }
    });
  }

  selectConversation(conv: Conversation, updateUrl = true): void {
    const prevConv = this.activeConversation();
    if (prevConv && prevConv._id !== conv._id) {
      this.stopTyping();
      this.socketService.leaveConversation(prevConv._id);
    }

    this.activeConversation.set(conv);
    this.editingMessage.set(null);
    this.replyingTo.set(null);
    this.typingUsers.set(new Map());
    this.isUserProfileOpen.set(false);

    // Join real-time room for this conversation
    this.socketService.joinConversation(conv._id);

    if (updateUrl) {
      this.router.navigate(['/chat', conv._id], { replaceUrl: true });
    }

    this.loadMessages(conv._id);
  }

  deselectConversation(): void {
    const prevConv = this.activeConversation();
    if (prevConv) {
      this.stopTyping();
      this.socketService.leaveConversation(prevConv._id);
    }
    this.activeConversation.set(null);
    this.editingMessage.set(null);
    this.replyingTo.set(null);
    this.typingUsers.set(new Map());
    this.isSearchOpen.set(false);
    this.clearSearch();
    this.closeGroupInfo();
    this.closeUserProfile();
    this.router.navigate(['/chat'], { replaceUrl: true });
  }

  onTouchStart(e: TouchEvent): void {
    if (e.touches && e.touches.length > 0) {
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
    }
  }

  onTouchEnd(e: TouchEvent): void {
    if (e.changedTouches && e.changedTouches.length > 0) {
      const deltaX = e.changedTouches[0].clientX - this.touchStartX;
      const deltaY = e.changedTouches[0].clientY - this.touchStartY;
      // Edge swipe right from left margin (< 60px) with minimum 75px horizontal displacement
      if (this.touchStartX < 60 && deltaX > 75 && Math.abs(deltaY) < 60) {
        this.deselectConversation();
      }
    }
  }

  loadMessages(conversationId: string): void {
    this.isLoadingMessages.set(true);

    // Mark as read immediately via socket & REST API
    this.socketService.emitMarkRead(conversationId);
    this.messageService.markAllAsRead(conversationId).subscribe();

    // Clear unread badge in sidebar for this conversation
    this.conversations.update((list) =>
      list.map((c) => (c._id === conversationId ? { ...c, unreadCount: 0 } : c))
    );

    this.messageService.getConversationMessages(conversationId).subscribe({
      next: (res) => {
        this.messages.set(res.messages);
        this.isLoadingMessages.set(false);
        this.shouldScrollBottom = true;
      },
      error: (err) => {
        console.error('Failed to load messages:', err);
        this.isLoadingMessages.set(false);
      }
    });
  }

  onInputChange(val: string): void {
    this.messageInput.set(val);
    const activeConv = this.activeConversation();
    if (!activeConv) return;

    if (val.trim().length > 0) {
      if (!this.isCurrentlyTyping) {
        this.isCurrentlyTyping = true;
        this.socketService.emitTypingStart(activeConv._id);
      }

      // Reset debounce timer
      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
      }
      this.typingTimeout = setTimeout(() => {
        this.stopTyping();
      }, 2500);
    } else {
      this.stopTyping();
    }
  }

  stopTyping(): void {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
    if (this.isCurrentlyTyping) {
      this.isCurrentlyTyping = false;
      const activeConv = this.activeConversation();
      if (activeConv) {
        this.socketService.emitTypingStop(activeConv._id);
      }
    }
  }

  async sendMessage(): Promise<void> {
    const text = this.messageInput().trim();
    const conv = this.activeConversation();
    const attachment = this.uploadedFileData();

    if ((!text && !attachment) || !conv || this.isSending() || this.isUploading()) return;

    // Stop typing indicator on message submission
    this.stopTyping();

    // Handle Edit Mode
    if (this.editingMessage()) {
      const msg = this.editingMessage()!;
      try {
        await this.socketService.emitEditMessage({
          messageId: msg._id,
          conversationId: conv._id,
          content: text
        });
        this.cancelEdit();
      } catch {
        // Fallback to REST API
        this.messageService.editMessage(msg._id, text).subscribe({
          next: (updated) => {
            this.messages.update((list) =>
              list.map((m) => (m._id === updated._id ? updated : m))
            );
            this.cancelEdit();
          }
        });
      }
      return;
    }

    // Handle New Message with optional Attachment
    this.isSending.set(true);
    const replyTarget = this.replyingTo();
    const messageType: MessageType = attachment
      ? (attachment.resourceType === 'image'
          ? 'image'
          : attachment.resourceType === 'audio'
            ? 'audio'
            : 'file')
      : 'text';

    const payload = {
      conversationId: conv._id,
      content: text,
      messageType,
      fileUrl: attachment ? attachment.fileUrl : '',
      fileName: attachment ? attachment.fileName : '',
      fileSize: attachment ? attachment.fileSize : 0,
      replyTo: replyTarget?._id || null
    };

    try {
      // 1. Send via WebSocket
      await this.socketService.emitSendMessage(payload);
      this.messageInput.set('');
      this.replyingTo.set(null);
      this.cancelAttachment();
      this.isSending.set(false);
    } catch (err) {
      console.warn('Socket send failed, falling back to REST API:', err);
      // 2. Fallback to REST API
      this.messageService.sendMessage(payload).subscribe({
        next: (newMsg) => {
          this.messages.update((list) => [...list, newMsg]);
          this.messageInput.set('');
          this.replyingTo.set(null);
          this.cancelAttachment();
          this.isSending.set(false);
          this.shouldScrollBottom = true;
        },
        error: (e) => {
          console.error('Failed to send message via REST:', e);
          this.isSending.set(false);
        }
      });
    }
  }

  // --- File Upload & Lightbox Methods (Phase 12) ---
  triggerFileInput(): void {
    if (this.fileInputRef) {
      this.fileInputRef.nativeElement.click();
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (file.size > 25 * 1024 * 1024) {
      alert('File size exceeds the 25MB limit.');
      input.value = '';
      return;
    }

    this.selectedFile.set(file);
    this.uploadError.set('');
    this.uploadProgress.set(0);
    this.isUploading.set(true);
    this.uploadedFileData.set(null);

    // If image, create local preview
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => this.filePreviewUrl.set(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      this.filePreviewUrl.set(null);
    }

    this.messageService.uploadAttachment(file).subscribe({
      next: (httpEvent) => {
        if (httpEvent.type === HttpEventType.UploadProgress && httpEvent.total) {
          const percent = Math.round((httpEvent.loaded / httpEvent.total) * 100);
          this.uploadProgress.set(percent);
        } else if (httpEvent.type === HttpEventType.Response) {
          const body = httpEvent.body;
          if (body && body.file) {
            this.uploadedFileData.set({
              fileUrl: body.file.fileUrl,
              fileName: body.file.fileName,
              fileSize: body.file.fileSize,
              resourceType: body.file.resourceType,
            });
          }
          this.isUploading.set(false);
          this.uploadProgress.set(100);
        }
      },
      error: (err) => {
        console.error('File upload failed:', err);
        this.uploadError.set('Upload failed. Please try again.');
        this.isUploading.set(false);
      }
    });
  }

  cancelAttachment(): void {
    this.selectedFile.set(null);
    this.filePreviewUrl.set(null);
    this.uploadProgress.set(0);
    this.isUploading.set(false);
    this.uploadError.set('');
    this.uploadedFileData.set(null);
    if (this.fileInputRef) {
      this.fileInputRef.nativeElement.value = '';
    }
  }

  formatFileSize(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  openLightbox(imageUrl: string): void {
    this.previewLightboxImage.set(imageUrl);
  }

  closeLightbox(): void {
    this.previewLightboxImage.set(null);
  }

  // --- Audio Message Playback (Phase 13) ---
  toggleAudioPlayback(msg: Message): void {
    if (!msg.fileUrl) return;

    if (this.activeAudioMessageId() === msg._id) {
      if (this.currentAudioElement && !this.currentAudioElement.paused) {
        this.currentAudioElement.pause();
        this.activeAudioMessageId.set(null);
        return;
      }
    }

    if (this.currentAudioElement) {
      this.currentAudioElement.pause();
      this.currentAudioElement = null;
    }

    const audio = new Audio(msg.fileUrl);
    this.currentAudioElement = audio;
    this.activeAudioMessageId.set(msg._id);

    if (msg.duration) {
      this.audioDurationMap.update((map) => ({ ...map, [msg._id]: msg.duration || 0 }));
    }

    audio.onloadedmetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        this.audioDurationMap.update((map) => ({ ...map, [msg._id]: audio.duration }));
      }
    };

    audio.ontimeupdate = () => {
      this.audioCurrentTimeMap.update((map) => ({ ...map, [msg._id]: audio.currentTime }));
    };

    audio.onended = () => {
      this.activeAudioMessageId.set(null);
      this.audioCurrentTimeMap.update((map) => ({ ...map, [msg._id]: 0 }));
    };

    audio.onerror = (e) => {
      console.error('Audio playback error:', e);
      this.activeAudioMessageId.set(null);
    };

    audio.play().catch((err) => {
      console.error('Could not start playback:', err);
      this.activeAudioMessageId.set(null);
    });
  }

  getAudioCurrentTime(msgId: string): number {
    return this.audioCurrentTimeMap()[msgId] || 0;
  }

  getAudioDuration(msg: Message): number {
    return this.audioDurationMap()[msg._id] || msg.duration || 0;
  }

  getAudioProgressPercent(msg: Message): number {
    const cur = this.getAudioCurrentTime(msg._id);
    const dur = this.getAudioDuration(msg);
    if (!dur || dur <= 0) return 0;
    return Math.min(100, Math.round((cur / dur) * 100));
  }

  seekAudio(msg: Message, event: MouseEvent, progressBar: HTMLElement): void {
    if (!msg.fileUrl) return;
    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));

    const dur = this.getAudioDuration(msg);
    if (dur > 0) {
      const targetTime = ratio * dur;
      if (this.activeAudioMessageId() === msg._id && this.currentAudioElement) {
        this.currentAudioElement.currentTime = targetTime;
        this.audioCurrentTimeMap.update((map) => ({ ...map, [msg._id]: targetTime }));
      } else {
        this.toggleAudioPlayback(msg);
        if (this.currentAudioElement) {
          this.currentAudioElement.currentTime = targetTime;
          this.audioCurrentTimeMap.update((map) => ({ ...map, [msg._id]: targetTime }));
        }
      }
    }
  }

  startReply(message: Message): void {
    if (message.isDeleted) return;
    this.cancelEdit();
    this.replyingTo.set(message);
  }

  cancelReply(): void {
    this.replyingTo.set(null);
  }

  startEdit(message: Message): void {
    if (message.isDeleted || !this.isCurrentUserSender(message)) return;
    this.cancelReply();
    this.editingMessage.set(message);
    this.messageInput.set(message.content);
  }

  cancelEdit(): void {
    this.editingMessage.set(null);
    this.messageInput.set('');
    this.stopTyping();
  }

  clearChatHistory(): void {
    const conv = this.activeConversation();
    if (!conv) return;

    if (!confirm('Are you sure you want to clear all messages in this conversation? This action cannot be undone.')) {
      return;
    }

    this.conversationService.clearChatHistory(conv._id).subscribe({
      next: () => {
        this.messages.set([]);
        this.socketService.emitClearChat(conv._id);
        this.conversations.update((list) =>
          list.map((c) => (c._id === conv._id ? { ...c, lastMessage: '' } : c))
        );
      },
      error: (err) => {
        console.error('Failed to clear chat history:', err);
      },
    });
  }

  async deleteMessage(message: Message): Promise<void> {
    if (!this.isCurrentUserSender(message) || message.isDeleted) return;
    if (!confirm('Are you sure you want to delete this message?')) return;

    try {
      await this.socketService.emitDeleteMessage({
        messageId: message._id,
        conversationId: message.conversationId || ''
      });
    } catch {
      // Fallback to REST
      this.messageService.deleteMessage(message._id).subscribe({
        next: () => {
          this.messages.update((list) =>
            list.map((m) =>
              m._id === message._id
                ? { ...m, isDeleted: true, content: 'This message was deleted' }
                : m
            )
          );
        }
      });
    }
  }

  getOtherParticipant(conv: Conversation): User | null {
    const currentId = this.authService.currentUser()?._id;
    if (!conv || !conv.participants || !currentId) return null;
    return this.conversationService.getOtherParticipant(conv, currentId);
  }

  isParticipantOnline(user: User | null | undefined): boolean {
    if (!user || !user._id) return false;
    return this.socketService.isUserOnline(user._id);
  }

  getParticipantLastSeen(user: User | null | undefined): string | Date | undefined {
    if (!user || !user._id) return undefined;
    return this.lastSeenMap()[user._id] || user.lastSeen;
  }

  formatLastSeen(dateVal: string | Date | undefined): string {
    if (!dateVal) return 'Offline';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 'Offline';

    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'Last seen just now';
    if (diffMins < 60) return `Last seen ${diffMins}m ago`;

    const isToday = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) {
      return `Last seen today at ${timeStr}`;
    }
    return `Last seen ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeStr}`;
  }

  isCurrentUserSender(message: Message): boolean {
    const user = this.authService.currentUser();
    const currentId = (user?._id || (user as any)?.id)?.toString();
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
    return message.sender.profileImage || '';
  }

  getReplyPreview(replyTo: string | Message | undefined): string {
    if (!replyTo) return '';
    if (typeof replyTo === 'string') return 'Original message';
    if (replyTo.isDeleted) return 'Deleted message';
    return replyTo.content || 'Attachment';
  }

  getMessageReceipt(message: Message): 'sent' | 'delivered' | 'read' {
    const conv = this.activeConversation();
    const currentId = this.authService.currentUser()?._id;
    if (!conv || !currentId) return 'sent';

    const readBy = message.readBy || [];
    const deliveredTo = message.deliveredTo || [];

    if (conv.isGroup) {
      const otherReaders = readBy.filter(
        (id) => (typeof id === 'string' ? id : id._id) !== currentId
      );
      if (otherReaders.length > 0) return 'read';
      const otherDelivered = deliveredTo.filter(
        (id) => (typeof id === 'string' ? id : id._id) !== currentId
      );
      if (otherDelivered.length > 0) return 'delivered';
      return 'sent';
    }

    const other = this.getOtherParticipant(conv);
    if (!other) return 'sent';
    const otherId = other._id;

    const hasRead = readBy.some(
      (id) => (typeof id === 'string' ? id : id._id) === otherId
    );
    if (hasRead) return 'read';

    const hasDelivered = deliveredTo.some(
      (id) => (typeof id === 'string' ? id : id._id) === otherId
    );
    if (hasDelivered) return 'delivered';

    return 'sent';
  }

  // --- Message Search Methods ---
  toggleSearch(): void {
    this.isSearchOpen.update((v) => !v);
    if (!this.isSearchOpen()) {
      this.clearSearch();
    }
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.currentResultIndex.set(0);
  }

  onSearchChange(term: string): void {
    this.searchQuery.set(term);
    const activeConv = this.activeConversation();
    if (!activeConv || !term.trim()) {
      this.searchResults.set([]);
      this.currentResultIndex.set(0);
      return;
    }

    this.isSearching.set(true);
    this.messageService.searchMessages(activeConv._id, term.trim()).subscribe({
      next: (results) => {
        this.searchResults.set(results);
        this.currentResultIndex.set(results.length > 0 ? 0 : -1);
        this.isSearching.set(false);
        if (results.length > 0) {
          this.scrollToMessageId(results[0]._id);
        }
      },
      error: (err) => {
        console.error('Message search failed:', err);
        this.isSearching.set(false);
      }
    });
  }

  nextSearchResult(): void {
    const list = this.searchResults();
    if (list.length === 0) return;
    const nextIdx = (this.currentResultIndex() + 1) % list.length;
    this.currentResultIndex.set(nextIdx);
    this.scrollToMessageId(list[nextIdx]._id);
  }

  prevSearchResult(): void {
    const list = this.searchResults();
    if (list.length === 0) return;
    const prevIdx = (this.currentResultIndex() - 1 + list.length) % list.length;
    this.currentResultIndex.set(prevIdx);
    this.scrollToMessageId(list[prevIdx]._id);
  }

  scrollToMessageId(messageId: string): void {
    setTimeout(() => {
      const el = document.getElementById(`msg-${messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('search-highlight');
        setTimeout(() => el.classList.remove('search-highlight'), 2200);
      }
    }, 60);
  }

  // --- Group Management Methods ---
  openCreateGroupModal(): void {
    this.newGroupName.set('');
    this.selectedGroupMembers.set([]);
    this.createGroupError.set('');
    this.userFilterInGroupModal.set('');
    this.isCreateGroupOpen.set(true);

    this.userService.getAllUsers().subscribe({
      next: (users) => this.allUsersList.set(users),
      error: (e) => console.error('Failed to load users for group:', e),
    });
  }

  closeCreateGroupModal(): void {
    this.isCreateGroupOpen.set(false);
    this.newGroupName.set('');
    this.selectedGroupMembers.set([]);
    this.createGroupError.set('');
  }

  toggleGroupMemberSelection(userId: string): void {
    this.selectedGroupMembers.update((list) => {
      if (list.includes(userId)) {
        return list.filter((id) => id !== userId);
      }
      return [...list, userId];
    });
  }

  isMemberSelected(userId: string): boolean {
    return this.selectedGroupMembers().includes(userId);
  }

  submitCreateGroup(): void {
    const name = this.newGroupName().trim();
    const members = this.selectedGroupMembers();

    if (!name) {
      this.createGroupError.set('Please enter a group name');
      return;
    }
    if (members.length < 1) {
      this.createGroupError.set('Please select at least 1 other member');
      return;
    }

    this.isCreatingGroup.set(true);
    this.createGroupError.set('');

    this.conversationService
      .createGroup({ groupName: name, participants: members })
      .subscribe({
        next: (conv) => {
          this.isCreatingGroup.set(false);
          this.closeCreateGroupModal();
          this.selectConversation(conv);
        },
        error: (err) => {
          console.error('Create group failed:', err);
          this.createGroupError.set(err.error?.message || 'Failed to create group');
          this.isCreatingGroup.set(false);
        },
      });
  }

  openGroupInfo(): void {
    const conv = this.activeConversation();
    if (!conv || !conv.isGroup) return;
    this.closeUserProfile();
    this.editGroupNameInput.set(conv.groupName || '');
    this.isEditingGroupName.set(false);
    this.isAddingMemberOpen.set(false);
    this.memberToAddSearch.set('');
    this.groupActionMessage.set('');
    this.isGroupInfoOpen.set(true);

    if (this.allUsersList().length === 0) {
      this.userService.getAllUsers().subscribe({
        next: (users) => this.allUsersList.set(users),
      });
    }
  }

  closeGroupInfo(): void {
    this.isGroupInfoOpen.set(false);
    this.isEditingGroupName.set(false);
    this.isAddingMemberOpen.set(false);
  }

  // --- Contact / Direct User Profile Drawer Methods ---
  openUserProfile(): void {
    const conv = this.activeConversation();
    if (!conv || conv.isGroup) return;
    this.closeGroupInfo();
    this.isUserProfileOpen.set(true);
  }

  closeUserProfile(): void {
    this.isUserProfileOpen.set(false);
  }

  getDirectRecipient(): User | null {
    const conv = this.activeConversation();
    if (!conv || conv.isGroup) return null;
    return this.getOtherParticipant(conv);
  }

  isCurrentUserAdmin(conv?: Conversation | null): boolean {
    const targetConv = conv || this.activeConversation();
    const currentId = this.authService.currentUser()?._id;
    if (!targetConv || !targetConv.isGroup || !currentId || !targetConv.groupAdmin) return false;
    return targetConv.groupAdmin.some((a) => (typeof a === 'string' ? a : a._id) === currentId);
  }

  isUserAdmin(userId: string, conv?: Conversation | null): boolean {
    const targetConv = conv || this.activeConversation();
    if (!targetConv || !targetConv.isGroup || !targetConv.groupAdmin) return false;
    return targetConv.groupAdmin.some((a) => (typeof a === 'string' ? a : a._id) === userId);
  }

  saveGroupName(): void {
    const conv = this.activeConversation();
    const newName = this.editGroupNameInput().trim();
    if (!conv || !newName) return;

    this.groupActionLoading.set(true);
    this.conversationService.updateGroup(conv._id, { groupName: newName }).subscribe({
      next: (updated) => {
        this.groupActionLoading.set(false);
        this.isEditingGroupName.set(false);
        this.groupActionMessage.set('Group name updated');
        setTimeout(() => this.groupActionMessage.set(''), 2500);
      },
      error: (e) => {
        this.groupActionLoading.set(false);
        this.groupActionMessage.set(e.error?.message || 'Failed to update name');
      },
    });
  }

  saveGroupNameDirect(newName: string): void {
    this.editGroupNameInput.set(newName);
    this.saveGroupName();
  }

  addMemberToGroup(user: User): void {
    const conv = this.activeConversation();
    if (!conv) return;

    this.groupActionLoading.set(true);
    this.conversationService.addGroupMembers(conv._id, [user._id]).subscribe({
      next: () => {
        this.groupActionLoading.set(false);
        this.memberToAddSearch.set('');
        this.groupActionMessage.set(`Added ${user.name} to group`);
        setTimeout(() => this.groupActionMessage.set(''), 2500);
      },
      error: (e) => {
        this.groupActionLoading.set(false);
        this.groupActionMessage.set(e.error?.message || 'Failed to add member');
      },
    });
  }

  removeMember(member: User): void {
    const conv = this.activeConversation();
    if (!conv) return;
    if (!confirm(`Are you sure you want to remove ${member.name} from the group?`)) return;

    this.groupActionLoading.set(true);
    this.conversationService.removeGroupMember(conv._id, member._id).subscribe({
      next: () => {
        this.groupActionLoading.set(false);
        this.groupActionMessage.set(`Removed ${member.name}`);
        setTimeout(() => this.groupActionMessage.set(''), 2500);
      },
      error: (e) => {
        this.groupActionLoading.set(false);
        this.groupActionMessage.set(e.error?.message || 'Failed to remove member');
      },
    });
  }

  toggleAdmin(member: User): void {
    const conv = this.activeConversation();
    if (!conv) return;
    const isAdm = this.isUserAdmin(member._id);
    const action = isAdm ? 'demote' : 'promote';

    this.groupActionLoading.set(true);
    this.conversationService.toggleGroupAdmin(conv._id, member._id, action).subscribe({
      next: () => {
        this.groupActionLoading.set(false);
        this.groupActionMessage.set(
          `${member.name} is ${isAdm ? 'no longer an admin' : 'now an admin'}`
        );
        setTimeout(() => this.groupActionMessage.set(''), 2500);
      },
      error: (e) => {
        this.groupActionLoading.set(false);
        this.groupActionMessage.set(e.error?.message || 'Failed to update admin role');
      },
    });
  }

  leaveCurrentGroup(): void {
    const conv = this.activeConversation();
    if (!conv) return;
    if (!confirm(`Are you sure you want to leave "${conv.groupName || 'this group'}"?`)) return;

    this.groupActionLoading.set(true);
    this.conversationService.leaveGroup(conv._id).subscribe({
      next: () => {
        this.groupActionLoading.set(false);
        this.closeGroupInfo();
      },
      error: (e) => {
        this.groupActionLoading.set(false);
        this.groupActionMessage.set(e.error?.message || 'Failed to leave group');
      },
    });
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollBottom) {
      this.scrollToBottom();
      this.shouldScrollBottom = false;
    }
  }

  private scrollToBottom(): void {
    try {
      if (this.messageFeed) {
        this.messageFeed.scrollToBottom();
      } else if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop =
          this.messagesContainer.nativeElement.scrollHeight;
      }
    } catch (err) {
      console.error('Scroll error:', err);
    }
  }

  ngOnDestroy(): void {
    this.stopTyping();
    if (this.currentAudioElement) {
      this.currentAudioElement.pause();
      this.currentAudioElement = null;
    }
    const active = this.activeConversation();
    if (active) {
      this.socketService.leaveConversation(active._id);
    }
    this.sub.unsubscribe();
  }
}
