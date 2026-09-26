import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { SocketService } from './socket.service';

@Injectable({
  providedIn: 'root'
})
export class NetworkService {
  private readonly socketService = inject(SocketService);

  // Network hardware state (navigator.onLine)
  readonly isOnline = signal<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Socket connection state
  readonly isSocketConnected = signal<boolean>(false);

  // Show "Back Online" temporary toast when transitioning offline -> online
  readonly showReconnectedNotice = signal<boolean>(false);
  private reconnectTimer: any = null;

  // Fully connected: internet active AND socket connected
  readonly isFullyConnected = computed(() => {
    return this.isOnline() && this.isSocketConnected();
  });

  // Human-readable status banner text
  readonly statusMessage = computed(() => {
    if (!this.isOnline()) {
      return 'You are currently offline. Cached messages remain visible, and new messages will sync automatically once reconnected.';
    }
    if (!this.isSocketConnected()) {
      return 'Connecting to real-time chat server...';
    }
    return 'Connected and synchronized';
  });

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnlineEvent());
      window.addEventListener('offline', () => this.handleOfflineEvent());
    }

    // Subscribe to socket connection
    this.socketService.isConnected$.subscribe((connected) => {
      this.isSocketConnected.set(connected);
    });
  }

  private handleOnlineEvent(): void {
    const wasOffline = !this.isOnline();
    this.isOnline.set(true);

    if (wasOffline) {
      this.triggerReconnectedNotice();
      this.socketService.connect();
    }
  }

  private handleOfflineEvent(): void {
    this.isOnline.set(false);
    this.showReconnectedNotice.set(false);
  }

  triggerReconnectedNotice(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.showReconnectedNotice.set(true);
    this.reconnectTimer = setTimeout(() => {
      this.showReconnectedNotice.set(false);
      this.reconnectTimer = null;
    }, 3500);
  }

  retryConnection(): void {
    if (typeof navigator !== 'undefined') {
      this.isOnline.set(navigator.onLine);
    }
    this.socketService.connect();
  }
}
