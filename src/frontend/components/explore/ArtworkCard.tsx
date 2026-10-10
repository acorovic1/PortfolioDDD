import { useState, type ReactNode } from 'react';
import { responsiveImage, resizedUrl } from '@/frontend/utils/images';
import type { FeedArtwork } from '@/types/Feed';
import { assetUrl } from '@/frontend/utils/api';
import { HeartIcon, EyeIcon, CubeIcon } from '@/frontend/svg/Icons';

type ArtworkCardProps = {
  artwork: Pick<FeedArtwork,
    'id' | 'title' | 'username' | 'avatarUrl' | 'thumbnailUrl' | 'coverUrl'
    | 'likeCount' | 'viewCount' | 'isMature' | 'aiGenerated'>;
  // Mature work is blurred until revealed, unless the viewer opted in.
  showMature: boolean;
  onOpen: () => void;
  onOpenAuthor?: () => void;
  // Extra corner badge (e.g. a marketplace price).
  badge?: ReactNode;
};

export default function ArtworkCard({ artwork, showMature, onOpen, onOpenAuthor, badge }: ArtworkCardProps) {
  const [revealed, setRevealed] = useState(false);
  const blurred = artwork.isMature && !showMature && !revealed;
  const image = assetUrl(artwork.coverUrl ?? artwork.thumbnailUrl);

  return (
    <article className="artwork-card">
      <button
        className={`artwork-card-thumb ${blurred ? 'blurred' : ''}`}
        onClick={() => (blurred ? setRevealed(true) : onOpen())}
        aria-label={blurred ? `Show mature artwork "${artwork.title}"` : `Open "${artwork.title}"`}
      >
        {image
          ? <img {...responsiveImage(image, [320, 480, 640, 960])} sizes="(max-width: 600px) 50vw, 300px" alt="" loading="lazy" decoding="async" />
          : <CubeIcon className="artwork-card-placeholder" />}
        {blurred && (
          <span className="artwork-card-mature">
            <strong>Mature content</strong>
            <span>Click to show</span>
          </span>
        )}
        <span className="artwork-card-badges">
          {artwork.aiGenerated && <span className="content-badge ai" title="Made with generative AI">AI</span>}
          {artwork.isMature && <span className="content-badge mature">18+</span>}
          {badge}
        </span>
      </button>

      <div className="artwork-card-body">
        <button className="artwork-card-title" onClick={onOpen} title={artwork.title}>
          {artwork.title || 'Untitled'}
        </button>
        <div className="artwork-card-meta">
          <button className="artwork-card-author" onClick={onOpenAuthor ?? onOpen}>
            {artwork.avatarUrl
              ? <img src={resizedUrl(assetUrl(artwork.avatarUrl)!, 96)} alt="" loading="lazy" />
              : <span className="artwork-card-avatar">{artwork.username.charAt(0).toUpperCase()}</span>}
            <span>{artwork.username}</span>
          </button>
          <span className="artwork-card-stats">
            <span title="Likes"><HeartIcon width={13} height={13} /> {artwork.likeCount}</span>
            <span title="Views"><EyeIcon width={13} height={13} /> {artwork.viewCount}</span>
          </span>
        </div>
      </div>
    </article>
  );
}
