import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type NotificationTone = 'chime' | 'pop' | 'ping' | 'pulse';

export interface NotificationSettings {
  soundEnabled: boolean;
  soundTone: NotificationTone;
  volume: number; // 0 to 100
  pushEnabled: boolean;
  inAppToastEnabled: boolean;
  dndEnabled: boolean;
  previewContent: boolean;
}

export interface ToastData {
  id: string;
  title: string;
  message: string;
  avatar?: string;
  conversationId?: string;
  onClick?: () => void;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  avatar?: string;
  conversationId?: string;
  timestamp: Date;
  isRead: boolean;
  type?: 'message' | 'group' | 'voice' | 'system';
  onClick?: () => void;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  soundEnabled: false,
  soundTone: 'chime',
  volume: 0,
  pushEnabled: false,
  inAppToastEnabled: false,
  dndEnabled: true,
  previewContent: false,
};

const STORAGE_KEY_SETTINGS = 'antigravity_chat_notif_settings';
const STORAGE_KEY_HISTORY = 'antigravity_chat_notif_history';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/users/notifications`;

  // Reactive State Signals
  readonly settings = signal<NotificationSettings>(this.loadStoredSettings());
  readonly notificationHistory = signal<NotificationItem[]>(this.loadStoredHistory());
  readonly activeToast = signal<ToastData | null>(null);
  readonly permissionStatus = signal<NotificationPermission>('default');

  // UI Drawer / Modal State Signals
  readonly isNotificationDrawerOpen = signal<boolean>(false);
  readonly isSettingsModalOpen = signal<boolean>(false);

  // Computed unread count for notification bell badge
  readonly unreadNotificationCount = computed(() => {
    return this.notificationHistory().filter((n) => !n.isRead).length;
  });

  private toastTimeout: any = null;
  private audioCtx: AudioContext | null = null;

  constructor() {
    this.initPermissionState();
    this.registerServiceWorker();
  }

  private initPermissionState(): void {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.permissionStatus.set(Notification.permission);
    }
  }

  private registerServiceWorker(): void {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.debug('[ServiceWorker] Registered with scope:', reg.scope);
        })
        .catch((err) => {
          console.debug('[ServiceWorker] Registration skipped/failed:', err);
        });
    }
  }

  /**
   * Request native browser notification permission
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }

    try {
      const perm = await Notification.requestPermission();
      this.permissionStatus.set(perm);
      if (perm === 'granted') {
        this.updateSettings({ pushEnabled: true });
      } else {
        this.updateSettings({ pushEnabled: false });
      }
      return perm;
    } catch (e) {
      console.error('Error requesting notification permission:', e);
      return 'denied';
    }
  }

  /**
   * Synthesize audio chime using Web Audio API with tone options & volume scaling
   */
  playNotificationSound(toneOverride?: NotificationTone, volumeOverride?: number): void {
    return;
  }

  private _unusedPlaySound(toneOverride?: NotificationTone, volumeOverride?: number): void {
    const s = this.settings();
    if (!s.soundEnabled || s.dndEnabled) return;

    const tone = toneOverride || s.soundTone || 'chime';
    const volPercent = volumeOverride !== undefined ? volumeOverride : s.volume;
    const gainValue = Math.max(0.01, Math.min(1.0, (volPercent / 100) * 0.12));

    try {
      if (typeof window === 'undefined') return;
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioCtxClass();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      gain.gain.setValueAtTime(gainValue, now);

      switch (tone) {
        case 'pop': {
          // Bubbly pop
          osc.type = 'sine';
          osc.frequency.setValueAtTime(650, now);
          osc.frequency.exponentialRampToValueAtTime(320, now + 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now);
          osc.stop(now + 0.15);
          break;
        }

        case 'ping': {
          // High-tech glass ping
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(1175, now);
          osc.frequency.exponentialRampToValueAtTime(1318, now + 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now);
          osc.stop(now + 0.35);
          break;
        }

        case 'pulse': {
          // Warm harmonic pulse
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523, now);
          osc.frequency.setValueAtTime(659, now + 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now);
          osc.stop(now + 0.4);
          break;
        }

        case 'chime':
        default: {
          // Cosmic rising chime: 784Hz -> 1046Hz
          osc.type = 'sine';
          osc.frequency.setValueAtTime(784, now);
          osc.frequency.exponentialRampToValueAtTime(1046, now + 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now);
          osc.stop(now + 0.45);
          break;
        }
      }
    } catch (e) {
      console.debug('Notification audio synthesis prevented:', e);
    }
  }

  /**
   * Preview a chosen tone with sound enabled regardless of DND/mute
   */
  testSound(tone?: NotificationTone, volume?: number): void {
    const prevSound = this.settings().soundEnabled;
    const prevDnd = this.settings().dndEnabled;

    // Temporarily allow test sound preview
    this.settings.update((st) => ({ ...st, soundEnabled: true, dndEnabled: false }));
    this.playNotificationSound(tone, volume);
    this.settings.update((st) => ({ ...st, soundEnabled: prevSound, dndEnabled: prevDnd }));
  }

  /**
   * Central notification dispatcher: In-App Toast + Audio Chime + History Log + Desktop Notification
   */
  notify(
    title: string,
    message: string,
    avatar?: string,
    conversationId?: string,
    onClick?: () => void
  ): void {
    return;
  }

  private _unusedNotify(
    title: string,
    message: string,
    avatar?: string,
    conversationId?: string,
    onClick?: () => void
  ): void {
    const s = this.settings();
    if (s.dndEnabled) return;

    // Prepare displayed content according to preview privacy settings
    const displayMessage = s.previewContent ? message : 'New message received';

    // 1. Play synthesized sound chime
    if (s.soundEnabled) {
      this.playNotificationSound();
    }

    // 2. Add to Notification Center History
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 6);
    const notifItem: NotificationItem = {
      id,
      title,
      message: displayMessage,
      avatar,
      conversationId,
      timestamp: new Date(),
      isRead: false,
      onClick,
    };

    this.notificationHistory.update((list) => {
      const updated = [notifItem, ...list.slice(0, 49)]; // keep latest 50
      this.saveHistory(updated);
      return updated;
    });

    // 3. Trigger In-App Glassmorphism Toast
    if (s.inAppToastEnabled) {
      this.activeToast.set({
        id,
        title,
        message: displayMessage,
        avatar,
        conversationId,
        onClick,
      });

      if (this.toastTimeout) {
        clearTimeout(this.toastTimeout);
      }
      this.toastTimeout = setTimeout(() => {
        if (this.activeToast()?.id === id) {
          this.activeToast.set(null);
        }
      }, 4500);
    }

    // 4. Desktop / Web Push Notification if tab is in background
    if (
      s.pushEnabled &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted' &&
      document.visibilityState !== 'visible'
    ) {
      try {
        const notif = new Notification(title, {
          body: displayMessage,
          icon: avatar || '/favicon.ico',
          badge: '/favicon.ico',
        });
        notif.onclick = () => {
          window.focus();
          if (onClick) onClick();
          notif.close();
        };
      } catch (err) {
        console.debug('Desktop notification error:', err);
      }
    }
  }

  dismissToast(): void {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }
    this.activeToast.set(null);
  }

  // --- Notification Center Methods ---
  toggleNotificationDrawer(open?: boolean): void {
    this.isNotificationDrawerOpen.update((v) => (open !== undefined ? open : !v));
    if (this.isNotificationDrawerOpen()) {
      this.isSettingsModalOpen.set(false);
    }
  }

  toggleSettingsModal(open?: boolean): void {
    this.isSettingsModalOpen.update((v) => (open !== undefined ? open : !v));
    if (this.isSettingsModalOpen()) {
      this.isNotificationDrawerOpen.set(false);
    }
  }

  markAllAsRead(): void {
    this.notificationHistory.update((list) => {
      const updated = list.map((item) => ({ ...item, isRead: true }));
      this.saveHistory(updated);
      return updated;
    });
  }

  markAsRead(id: string): void {
    this.notificationHistory.update((list) => {
      const updated = list.map((item) => (item.id === id ? { ...item, isRead: true } : item));
      this.saveHistory(updated);
      return updated;
    });
  }

  clearHistory(): void {
    this.notificationHistory.set([]);
    this.saveHistory([]);
  }

  removeNotification(id: string): void {
    this.notificationHistory.update((list) => {
      const updated = list.filter((item) => item.id !== id);
      this.saveHistory(updated);
      return updated;
    });
  }

  // --- Settings Persistence & Synchronization ---
  updateSettings(partial: Partial<NotificationSettings>): void {
    this.settings.update((curr) => {
      const updated = { ...curr, ...partial };
      this.saveSettings(updated);
      return updated;
    });

    // Synchronize to backend if user is authenticated
    this.http.put(this.apiUrl, partial).subscribe({
      next: () => {},
      error: (e) => console.debug('Failed to sync notification settings to backend:', e),
    });
  }

  private loadStoredSettings(): NotificationSettings {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (raw) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.error('Error loading notification settings:', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  private saveSettings(settings: NotificationSettings): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Error saving notification settings:', e);
    }
  }

  private loadStoredHistory(): NotificationItem[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp),
        }));
      }
    } catch (e) {
      console.error('Error loading notification history:', e);
    }
    return [];
  }

  private saveHistory(history: NotificationItem[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
    } catch (e) {
      console.error('Error saving notification history:', e);
    }
  }
}
