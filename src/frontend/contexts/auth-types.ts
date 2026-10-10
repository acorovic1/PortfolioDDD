import type { SocialNetwork, WorkType, ExperienceEntry } from '@/types/ProfileData';

export interface User {
  id: string;
  email: string;
  username: string;
  name?: string;
  avatarUrl?: string | null;
  title?: string | null;
  bio?: string | null;
  location?: string | null;
  github?: string | null;
  linkedin?: string | null;
  skills?: string[];
  // Viewer content preferences
  showMature?: boolean;
  hideAi?: boolean;
  // Creator opt-out of AI training ("NoAI")
  noAiTraining?: boolean;
  role?: 'user' | 'admin';
  coverUrl?: string | null;
  website?: string | null;
  socialLinks?: Partial<Record<SocialNetwork, string>>;
  availableForWork?: boolean;
  workTypes?: WorkType[];
  experience?: ExperienceEntry[];
  emailVerified?: boolean;
  emailNotifications?: boolean;
}
