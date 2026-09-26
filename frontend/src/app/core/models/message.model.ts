import { User } from './user.model';

export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'video';

export interface Message {
  _id: string;
  conversationId: string;
  sender: User | string;
  content: string;
  messageType: MessageType;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
  isEdited: boolean;
  isDeleted: boolean;
  deliveredTo: (User | string)[];
  readBy: (User | string)[];
  status?: 'sent' | 'delivered' | 'read';
  replyTo?: string | Message;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
