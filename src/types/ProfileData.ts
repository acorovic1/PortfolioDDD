import type { ReactNode } from 'react';

export type SocialNetwork = 'artstation' | 'sketchfab' | 'instagram' | 'x' | 'youtube' | 'behance';
export type WorkType = 'freelance' | 'full_time' | 'contract' | 'commissions';

export type ExperienceEntry = {
  role: string;
  company: string;
  location?: string;
  // "YYYY" or "YYYY-MM"; empty end = current role
  start: string;
  end?: string;
  description?: string;
};

export type ProfileData = {
  username: string;
  avatarUrl: string;
  title: string;
  email: string;
  github?: string;
  linkedin?: string;
  bio?: string;
  skills?: string[];
  location?: string;
  coverUrl?: string | null;
  website?: string;
  socialLinks?: Partial<Record<SocialNetwork, string>>;
  availableForWork?: boolean;
  workTypes?: WorkType[];
  experience?: ExperienceEntry[];
};

export type SkillsSectionProps = {
  profile: ProfileData;
  editable: boolean;
  onUpdate: (key: keyof ProfileData, value: string[]) => void;
};

export type SidebarProps = {
  profile: ProfileData;
  editable?: boolean;
  onChange?: (next: ProfileData) => void;
  onAvatarUpload?: (file: File) => void;
  onCoverUpload?: (file: File) => void;
  // Rendered under the profile header (follow stats, actions...).
  children?: ReactNode;
};

export type ProfileHeaderProps = {
  profile: ProfileData;
  editable: boolean;
  onUpdate: (key: keyof ProfileData, value: string) => void;
  onAvatarUpload?: (file: File) => void;
};

export type BioSectionProps = {
  profile: ProfileData;
  editable: boolean;
  onUpdate: (key: keyof ProfileData, value: string) => void;
};

export type ContactSectionProps = {
  profile: ProfileData;
  editable: boolean;
  onUpdate: (key: keyof ProfileData, value: string) => void;
};

