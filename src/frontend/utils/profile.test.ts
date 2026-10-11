import { describe, it, expect } from 'vitest';
import { profileChanges, toProfileData } from './profile';
import type { User } from '@/frontend/contexts/auth-types';

const user = {
  id: 'u1',
  username: 'alice',
  email: 'alice@example.com',
  title: 'Hard-surface artist',
  avatarUrl: '/uploads/avatar.png',
  skills: ['Blender'],
  github: '',
} as unknown as User;

describe('toProfileData', () => {
  it('maps a user, resolving upload paths to full URLs', () => {
    const profile = toProfileData(user);
    expect(profile.username).toBe('alice');
    expect(profile.email).toBe('alice@example.com');
    expect(profile.avatarUrl).toMatch(/^https?:\/\/.+\/uploads\/avatar\.png$/);
    expect(profile.github).toBeUndefined(); // empty strings are "not set"
  });

  it('hides the email on other people’s profiles', () => {
    expect(toProfileData(user, { includeEmail: false }).email).toBe('');
  });

  it('gives a placeholder profile when signed out', () => {
    const profile = toProfileData(null);
    expect(profile.username).toBe('');
    expect(profile.avatarUrl).toBe('/vite.svg');
    expect(profile.skills).toEqual([]);
  });
});

describe('profileChanges', () => {
  it('returns only the editable fields that changed', () => {
    const before = toProfileData(user);
    const after = { ...before, title: 'Character artist', skills: ['Blender', 'ZBrush'], username: 'mallory' };

    expect(profileChanges(before, after)).toEqual({ title: 'Character artist', skills: ['Blender', 'ZBrush'] });
  });

  it('is empty when nothing changed', () => {
    const profile = toProfileData(user);
    expect(profileChanges(profile, { ...profile, skills: [...profile.skills!] })).toEqual({});
  });
});
