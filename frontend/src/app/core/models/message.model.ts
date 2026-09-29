import { User } from './user.model';

export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'video';

export interface MessageReaction {
  emoji: string;
  users: Array<{ _id: string; name: string; email?: string; profileImage?: string } | string>;
}

export interface Message {
  _id: string;
  conversationId?: string;
  channelId?: string;
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
  parentMessageId?: string;
  threadCount?: number;
  threadLastReplyAt?: string | Date;
  threadParticipants?: (User | string)[];
  reactions?: MessageReaction[];
  mentions?: (User | string)[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
