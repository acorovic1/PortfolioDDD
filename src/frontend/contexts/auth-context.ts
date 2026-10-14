import { createContext } from 'react';
import type { User, MessagesFrom } from './auth-types';
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
  emailNotifications?: boolean;
  locale?: 'en' | 'bs' | 'de';
  messagesFrom?: MessagesFrom;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  // Resolves with a challenge when the account needs a two-factor code next.
  login: (email: string, password: string) => Promise<{ twoFactorChallenge?: string }>;
  completeTwoFactorLogin: (challengeToken: string, code: string) => Promise<{ usedRecoveryCode: boolean }>;
  // Swaps in a new session token (after the server revoked the old ones).
  replaceSessionToken: (token: string) => Promise<void>;
  logoutEverywhere: () => Promise<void>;
  refreshUser: () => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<void>;
  logout: () => void;
  updateUsername: (username: string) => Promise<void>;
  // Needs the current password, and a two-factor code when that's on.
  updateEmail: (email: string, password: string, code?: string) => Promise<void>;
  // Emails a password reset link to the account's address.
  sendPasswordResetLink: () => Promise<void>;
  updateProfile: (fields: ProfileUpdateFields) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  uploadCover: (file: File) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
