export interface User {
  _id: string;
  name: string;
  email: string;
  profileImage?: string;
  isOnline: boolean;
  lastSeen?: string | Date;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
