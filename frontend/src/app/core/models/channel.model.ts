import { User } from './user.model';
import { Team } from './team.model';

export type ChannelType = 'PUBLIC' | 'PRIVATE';
export type ChannelMemberRole = 'ADMIN' | 'MEMBER';

export interface ChannelMember {
  user: User;
  role: ChannelMemberRole;
  joinedAt: string | Date;
}

export interface Channel {
  _id: string;
  name: string;
  displayName?: string;
  description?: string;
  topic?: string;
  team: Team | string;
  organization: string;
  type: ChannelType;
  isDefault: boolean;
  isArchived: boolean;
  members: ChannelMember[];
  createdBy: User;
  createdAt: string;
  updatedAt: string;
  membersCount?: number;
  myRole?: ChannelMemberRole | null;
  isMember?: boolean;
}

export interface CreateChannelDto {
  name: string;
  displayName?: string;
  description?: string;
  topic?: string;
  teamId: string;
  type?: ChannelType;
  memberIds?: string[];
}

export interface UpdateChannelDto {
  displayName?: string;
  description?: string;
  topic?: string;
  isArchived?: boolean;
}

export interface AddChannelMemberDto {
  userId: string;
  role?: ChannelMemberRole;
}
