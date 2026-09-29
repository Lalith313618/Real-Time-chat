import { OrganizationRole } from './organization.model';

export type PresenceStatus = 'available' | 'busy' | 'away' | 'offline';

export interface User {
  _id: string;
  name: string;
  email: string;
  profileImage?: string;
  isOnline: boolean;
  lastSeen?: string | Date;
  currentOrganization?: string;
  jobTitle?: string;
  department?: string;
  bio?: string;
  phone?: string;
  statusMessage?: string;
  statusEmoji?: string;
  presenceStatus?: PresenceStatus;
  orgRole?: OrganizationRole;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface UpdateProfileDto {
  name?: string;
  profileImage?: string;
  jobTitle?: string;
  department?: string;
  bio?: string;
  phone?: string;
  statusMessage?: string;
  statusEmoji?: string;
  presenceStatus?: PresenceStatus;
}
