export type FeedTab = 'trending' | 'latest' | 'following';

export type FeedArtwork = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  thumbnailUrl: string | null;
  coverUrl: string | null;
  username: string;
  name: string;
  avatarUrl: string | null;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  isMature: boolean;
  aiGenerated: boolean;
  publishedAt: string;
};

export type FeedFacet = { name: string; count: number };

export type FeedFacets = {
  categories: FeedFacet[];
  tags: FeedFacet[];
  tools: FeedFacet[];
};

// Where a view of an artwork came from (sent with view tracking and shown in
// creator analytics).
export type ViewSource =
  | 'explore' | 'following' | 'search' | 'profile' | 'notification'
  | 'challenge' | 'marketplace' | 'external' | 'direct';
