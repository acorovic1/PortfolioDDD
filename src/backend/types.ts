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
  show_mature: boolean;
  hide_ai: boolean;
  no_ai_training: boolean;
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
  showMature: boolean;
  hideAi: boolean;
  noAiTraining: boolean;
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
  processing_status: ProcessingStatus;
  processing_error: string | null;
  pending_source_path: string | null;
  source_format: string | null;
  model_version: number;
  model_size_bytes: string | number | null;
  thumbnail_path: string | null;
  tags: string[];
  visibility: Visibility;
  published_at: string | null;
  is_mature: boolean;
  ai_generated: boolean;
  view_count: number;
  followers_notified: boolean;
}

export type Visibility = 'public' | 'unlisted' | 'private';

// 'processing' while an upload is being converted, 'failed' if the latest
// upload couldn't be converted (an earlier version may still be served).
export type ProcessingStatus = 'processing' | 'ready' | 'failed';

export type ArtworkDTO = {
  id: string;
  title: string;
  description: string;
  year: string;
  category: string;
  tools: string[];
  // '' until the first upload has finished processing.
  modelUrl: string;
  processingStatus: ProcessingStatus;
  processingError: string | null;
  sourceFormat: string | null;
  modelVersion: number;
  modelSizeBytes: number | null;
  thumbnailUrl: string | null;
  tags: string[];
  visibility: Visibility;
  // null = draft; in the future = scheduled
  publishedAt: string | null;
  isMature: boolean;
  aiGenerated: boolean;
  viewCount: number;
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
  is_read: boolean;
  created_at: string;
}

export type NotificationDTO = {
  id: string;
  type: string;
  message: string;
  actorUsername: string;
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
