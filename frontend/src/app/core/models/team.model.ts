import { User } from './user.model';

export type TeamRole = 'LEAD' | 'ADMIN' | 'MEMBER';
export type TeamPrivacy = 'PUBLIC' | 'PRIVATE';

export interface TeamMember {
  user: User;
  role: TeamRole;
  joinedAt: string | Date;
}

export interface Team {
  _id: string;
  name: string;
  description?: string;
  organization: string;
  icon?: string;
  privacy: TeamPrivacy;
  members: TeamMember[];
  createdBy: User;
  createdAt: string;
  updatedAt: string;
  membersCount?: number;
  myRole?: TeamRole | null;
  isMember?: boolean;
}

export interface CreateTeamDto {
  name: string;
  description?: string;
  privacy?: TeamPrivacy;
  icon?: string;
  organizationId?: string;
  initialMemberIds?: string[];
}

export interface UpdateTeamDto {
  name?: string;
  description?: string;
  privacy?: TeamPrivacy;
  icon?: string;
}

export interface AddTeamMemberDto {
  userId?: string;
  email?: string;
  role?: TeamRole;
}
