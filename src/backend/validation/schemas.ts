import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(6).max(200),
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, - and _'),
  name: z.string().trim().min(1).max(255).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(200),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  avatarUrl: z.string().trim().max(512).optional(),
  title: z.string().trim().max(255).optional(),
  bio: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(255).optional(),
  github: z.string().trim().max(255).optional(),
  linkedin: z.string().trim().max(255).optional(),
  skills: z.array(z.string().trim().max(64)).max(50).optional(),
});

export const updateUsernameSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, - and _'),
});

export const updateEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(6).max(200),
});

export const createArtworkSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).optional(),
  year: z.string().trim().max(16).optional(),
  category: z.string().trim().max(128).optional(),
  tools: z.union([z.string(), z.array(z.string())]).optional(),
});

export const updateArtworkSchema = createArtworkSchema;

export const createCollectionSchema = z.object({
  name: z.string().trim().min(1).max(255),
});

export const addCommentSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(200),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(255),
  newPassword: z.string().min(6).max(200),
});
