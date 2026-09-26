import { User } from './user.model';

export type NotificationType = 'message' | 'group_invite' | 'system';

export interface Notification {
  _id: string;
  recipient: User | string;
  sender: User | string;
  type: NotificationType;
  message: string;
  conversationId?: string;
  isRead: boolean;
  createdAt?: string | Date;
}
