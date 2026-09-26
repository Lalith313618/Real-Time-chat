import { User } from './user.model';

export interface Conversation {
  _id: string;
  participants: User[];
  isGroup: boolean;
  groupName?: string;
  groupImage?: string;
  groupAdmin?: (User | string)[];
  lastMessage?: string;
  lastMessageSender?: User | string;
  lastMessageAt?: string | Date;
  unreadCount?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
