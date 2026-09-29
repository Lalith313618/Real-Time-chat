import { User } from './user.model';

export type NotificationType =
  | 'MENTION'
  | 'TASK_ASSIGNED'
  | 'TASK_STATUS'
  | 'REPLY'
  | 'REACTION'
  | 'TEAM_INVITE'
  | 'CHANNEL_INVITE'
  | 'SYSTEM';

export interface NotificationMetadata {
  messageId?: string;
  channelId?: string;
  teamId?: string;
  taskId?: string;
  conversationId?: string;
  channelName?: string;
  teamName?: string;
  emoji?: string;
}

export interface Notification {
  _id: string;
  recipient: User | string;
  sender?: User | null;
  organization?: string;
  type: NotificationType;
  title: string;
  content?: string;
  link?: string;
  metadata?: NotificationMetadata;
  isRead: boolean;
  readAt?: string | Date | null;
  createdAt: string | Date;
  updatedAt?: string | Date;
}
