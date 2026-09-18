import type { Request } from 'express';

export interface UserRecord {
  id: string;
  email: string;
  username: string;
  name: string;
  password_hash: string;
  avatar_url: string | null;
  title: string | null;
  bio: string | null;
  location: string | null;
  github: string | null;
  linkedin: string | null;
  skills: string[] | null;
  created_at: string;
  reset_token_hash: string | null;
  reset_token_expires: string | null;
}

export type PublicUser = {
  id: string;
  email: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  title: string | null;
  bio: string | null;
  location: string | null;
  github: string | null;
  linkedin: string | null;
  skills: string[];
};

export interface RenderRecord {
  id: string;
  artwork_id: string;
  url: string;
  caption: string | null;
  created_at: string;
}

export type RenderDTO = {
  id: string;
  url: string;
  caption: string;
  createdAt: string;
};

export interface ArtworkRecord {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  year: string | null;
  category: string | null;
  tools: string[] | null;
  model_path: string;
  created_at: string;
  updated_at: string;
}

export type ArtworkDTO = {
  id: string;
  title: string;
  description: string;
  year: string;
  category: string;
  tools: string[];
  modelUrl: string;
  renders: RenderDTO[];
  createdAt: string;
  updatedAt: string;
  likeCount: number;
  // Only populated where the artwork's owner isn't already implied by context
  // (e.g. batch lookups spanning multiple users' artworks).
  username?: string;
};

export interface CollectionRecord {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export type CollectionDTO = {
  id: string;
  name: string;
  artworkIds: string[];
  createdAt: string;
};

export interface CommentRecord {
  id: string;
  artwork_id: string;
  user_id: string;
  author: string;
  text: string;
  created_at: string;
}

export type CommentDTO = {
  id: string;
  author: string;
  text: string;
  postedAt: string;
  artworkId: string;
};

export interface NotificationRecord {
  id: string;
  user_id: string;
  actor_username: string;
  type: string;
  message: string;
  artwork_id: string | null;
  is_read: number;
  created_at: string;
}

export type NotificationDTO = {
  id: string;
  type: string;
  message: string;
  artworkId: string | null;
  isRead: boolean;
  createdAt: string;
};

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
  };
}
