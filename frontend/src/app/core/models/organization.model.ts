import { User } from './user.model';

export type OrganizationRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER' | 'GUEST';

export interface OrganizationMember {
  user: User;
  role: OrganizationRole;
  joinedAt: string | Date;
}

export interface Organization {
  _id: string;
  name: string;
  description?: string;
  logo?: string;
  owner: User | string;
  members: OrganizationMember[];
  inviteCode?: string;
  memberCount?: number;
  myRole?: OrganizationRole;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrganizationDto {
  name: string;
  description?: string;
  logo?: string;
}

export interface UpdateOrganizationDto {
  name?: string;
  description?: string;
  logo?: string;
}

export interface InviteMemberDto {
  email?: string;
  userId?: string;
  role?: OrganizationRole;
}
