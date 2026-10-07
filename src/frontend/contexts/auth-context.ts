import { createContext } from 'react';
import type { User } from './auth-types';
import type { SocialNetwork, WorkType, ExperienceEntry } from '@/types/ProfileData';

export interface ProfileUpdateFields {
  name?: string;
  title?: string;
  bio?: string;
  location?: string;
  github?: string;
  linkedin?: string;
  skills?: string[];
  showMature?: boolean;
  hideAi?: boolean;
  noAiTraining?: boolean;
  website?: string;
  socialLinks?: Partial<Record<SocialNetwork, string>>;
  availableForWork?: boolean;
  workTypes?: WorkType[];
  experience?: ExperienceEntry[];
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<void>;
  logout: () => void;
  updateUsername: (username: string) => Promise<void>;
  updateEmail: (email: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateProfile: (fields: ProfileUpdateFields) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  uploadCover: (file: File) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
