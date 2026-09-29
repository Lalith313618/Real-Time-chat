import { User } from './user.model';
import { Team } from './team.model';
import { Channel } from './channel.model';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'COMPLETED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface ChecklistItem {
  _id?: string;
  title: string;
  isCompleted: boolean;
  completedAt?: string | Date | null;
}

export interface TaskAttachment {
  fileUrl: string;
  fileName: string;
  fileSize?: number;
}

export interface Task {
  _id: string;
  title: string;
  description?: string;
  organization: string;
  team?: Team | string | null;
  channel?: Channel | string | null;
  creator: User;
  assignees: User[];
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | Date | null;
  checklist: ChecklistItem[];
  labels: string[];
  attachments: TaskAttachment[];
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateTaskDto {
  title: string;
  description?: string;
  organization?: string;
  team?: string | null;
  channel?: string | null;
  assignees?: string[];
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | Date | null;
  checklist?: Array<{ title: string; isCompleted?: boolean }>;
  labels?: string[];
  attachments?: TaskAttachment[];
}

export interface UpdateTaskDto {
  title?: string;
  description?: string;
  team?: string | null;
  channel?: string | null;
  assignees?: string[];
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | Date | null;
  checklist?: ChecklistItem[];
  labels?: string[];
  attachments?: TaskAttachment[];
}
