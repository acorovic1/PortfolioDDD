import { useEffect, useState } from 'react';
import '@/frontend/css/LikedPostsPage.css';
import type { RemoteArtwork } from '@/types/PortfolioPiece';
import { HeartIcon, ImageIcon } from '@/frontend/svg/Icons';
import { API_BASE_URL } from '@/frontend/config/api';
import { assetUrl } from '@/frontend/utils/api';

type LikedPostsPageProps = {
    likedArtworkIds: Record<string, boolean>;
    onSelectArtwork: (artworkId: string, username: string) => void;
};

export default function LikedPostsPage({ likedArtworkIds, onSelectArtwork }: LikedPostsPageProps) {
    const [likedArtworks, setLikedArtworks] = useState<RemoteArtwork[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const likedIds = Object.keys(likedArtworkIds).filter(id => likedArtworkIds[id]);
    const likedIdsKey = likedIds.slice().sort().join(',');

    useEffect(() => {
        if (!likedIdsKey) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLikedArtworks([]);
            setIsLoading(false);
            return;
        }

        let cancelled = false;
        setIsLoading(true);

        fetch(`${API_BASE_URL}/api/portfolio/artworks/batch?ids=${likedIdsKey}`)
            .then(res => (res.ok ? res.json() : []))
            .then((data: RemoteArtwork[]) => {
                if (!cancelled) setLikedArtworks(data);
            })
            .catch(err => console.error('Failed to load liked artworks:', err))
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [likedIdsKey]);

    return (
        <div className="liked-posts-page">
            <div className="activity-hero">
                <h2>Liked Posts</h2>
                <p>Artworks you've liked across the portfolio.</p>
            </div>

            {!isLoading && likedArtworks.length === 0 ? (
                <div className="activity-empty">
                    <HeartIcon />
                    <h3>No liked posts yet</h3>
                    <p>Like an artwork to see it show up here.</p>
                </div>
            ) : (
                <div className="activity-grid">
                    {likedArtworks.map((artwork) => (
                        <button
                            key={artwork.id}
                            className="liked-card"
                            onClick={() => onSelectArtwork(artwork.id, artwork.username!)}
                        >
                            <div className="liked-card-thumb">
                                {artwork.renders[0] || artwork.thumbnailUrl ? (
                                    <img src={assetUrl(artwork.renders[0]?.url ?? artwork.thumbnailUrl)!} alt={artwork.title} />
                                ) : (
                                    <ImageIcon />
                                )}
                            </div>
                            <div className="liked-card-body">
                                <h3 className="liked-card-title">{artwork.title || 'Untitled'}</h3>
                                <p className="liked-card-meta">
                                    {artwork.category || 'Uncategorized'}
                                    {artwork.year ? ` · ${artwork.year}` : ''}
                                </p>
                            </div>
                            <div className="liked-card-heart">
                                <HeartIcon fill="currentColor" />
                                <span>{artwork.likeCount}</span>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
