import type { ReactNode } from 'react';

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

