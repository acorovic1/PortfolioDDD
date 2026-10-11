import type { ProfileData } from '@/types/ProfileData';
import type { User } from '@/frontend/contexts/auth-types';
import { assetUrl } from './api';

// The sidebar's view of an account. `includeEmail` is off for other people's
// profiles, whose email the sidebar shouldn't show.
export function toProfileData(user: User | null, { includeEmail = true } = {}): ProfileData {
  return {
    username: user?.username || '',
    avatarUrl: assetUrl(user?.avatarUrl) ?? '/vite.svg',
    title: user?.title || '',
    email: includeEmail ? user?.email || '' : '',
    github: user?.github || undefined,
    linkedin: user?.linkedin || undefined,
    bio: user?.bio || undefined,
    skills: user?.skills || [],
    location: user?.location || undefined,
    coverUrl: assetUrl(user?.coverUrl),
    website: user?.website || undefined,
    socialLinks: user?.socialLinks ?? {},
    availableForWork: !!user?.availableForWork,
    workTypes: user?.workTypes ?? [],
    experience: user?.experience ?? [],
  };
}

const EDITABLE_PROFILE_FIELDS = [
  'title', 'bio', 'location', 'github', 'linkedin', 'skills', 'website',
  'socialLinks', 'availableForWork', 'workTypes', 'experience',
] as const;

// Only the editable fields that changed: re-sending untouched fields would
// re-validate them (e.g. a link saved before links were validated would
// block every edit).
export function profileChanges(previous: ProfileData, next: ProfileData): Partial<ProfileData> {
  return Object.fromEntries(
    EDITABLE_PROFILE_FIELDS
      .filter(key => JSON.stringify(next[key]) !== JSON.stringify(previous[key]))
      .map(key => [key, next[key]])
  );
}
