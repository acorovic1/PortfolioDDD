import { useEffect, useState } from 'react';
import '@/frontend/css/MyCommentsPage.css';
import type { RemoteArtwork } from '@/types/PortfolioPiece';
import type { Comment } from '@/types/Comment';
import { CommentIcon } from '@/frontend/svg/Icons';
import { API_BASE_URL } from '@/frontend/config/api';

type MyCommentsPageProps = {
    commentsByArtwork: Record<string, Comment[]>;
    currentUserName?: string;
    onSelectArtwork: (artworkId: string, username: string) => void;
};

export default function MyCommentsPage({ commentsByArtwork, currentUserName, onSelectArtwork }: MyCommentsPageProps) {
    const [artworkById, setArtworkById] = useState<Map<string, RemoteArtwork>>(new Map());

    const myComments = Object.entries(commentsByArtwork)
        .flatMap(([artworkId, comments]) =>
            comments
                .filter((comment) => comment.author === currentUserName)
                .map((comment) => ({ comment, artworkId }))
        );

    // Comments can be on anyone's artwork, not just your own - fetch the real
    // title/owner for each one instead of only resolving against your own
    // artworks (which left comments on other users' work as "Untitled").
    const artworkIdsKey = Array.from(new Set(myComments.map(c => c.artworkId))).sort().join(',');

    useEffect(() => {
        if (!artworkIdsKey) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setArtworkById(new Map());
            return;
        }

        let cancelled = false;

        fetch(`${API_BASE_URL}/api/portfolio/artworks/batch?ids=${artworkIdsKey}`)
            .then(res => (res.ok ? res.json() : []))
            .then((data: RemoteArtwork[]) => {
                if (!cancelled) setArtworkById(new Map(data.map(a => [a.id, a])));
            })
            .catch(err => console.error('Failed to load commented artworks:', err));

        return () => {
            cancelled = true;
        };
    }, [artworkIdsKey]);

    return (
        <div className="my-comments-page">
            <div className="activity-hero">
                <h2>My Comments</h2>
                <p>Comments you've left on artworks in the portfolio.</p>
            </div>

            {myComments.length === 0 ? (
                <div className="activity-empty">
                    <CommentIcon />
                    <h3>No comments yet</h3>
                    <p>Leave a comment on an artwork to see it show up here.</p>
                </div>
            ) : (
                <div className="my-comments-list">
                    {myComments.map(({ comment, artworkId }) => {
                        const artwork = artworkById.get(artworkId);
                        return (
                            <button
                                key={comment.id}
                                className="my-comment-item"
                                onClick={() => artwork?.username && onSelectArtwork(artworkId, artwork.username)}
                                disabled={!artwork?.username}
                            >
                                <div className="my-comment-header">
                                    <span className="my-comment-artwork">
                                        {artwork?.title || 'Untitled artwork'}
                                    </span>
                                    <span className="my-comment-time">{comment.postedAt}</span>
                                </div>
                                <p className="my-comment-text">{comment.text}</p>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
