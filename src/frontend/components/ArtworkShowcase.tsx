import { useEffect, useRef, useState } from 'react';
import { publishStatus, type PortfolioPiece, type PublishingState } from '@/types/PortfolioPiece';
import PublishingPanel from '@/frontend/components/PublishingPanel';
import ListingBox from '@/frontend/components/marketplace/ListingBox';
import type { Comment } from '@/types/Comment';
import type { Collection } from '@/types/Collection';
import RenderGallery from './RenderGallery';
import ArtworkInfo from '@/frontend/components/ArtworkInfo';
import SaveToCollectionPanel from '@/frontend/components/SaveToCollectionPanel';
import '../css/ArtworkShowcase.css';
import '../css/ArtworkInfo.css';
import type { ArtworkInfoData } from '@/types/ArtworkInfoData';
import { ImageIcon, HeartIcon, BookmarkIcon, CloseIcon, ShareIcon, EyeIcon, FlagIcon } from '@/frontend/svg/Icons';
import ReportDialog, { type ReportTarget } from '@/frontend/components/moderation/ReportDialog';
import { useAuth } from '@/frontend/hooks/useAuth';

type ArtworkShowcaseProps = {
    artworks: PortfolioPiece[];
    selectedIndex: number;

    editable?: boolean;
    onRenderAdd: () => void;
    onDeleteRender: (renderId: string) => void;
    onInfoUpdate: <K extends keyof ArtworkInfoData>(key: K, value: ArtworkInfoData[K]) => void;
    onDeleteArtwork: (artworkId: string) => void;
    likedArtworkIds: Record<string, boolean>;
    onToggleLike: (artworkId: string) => void;
    commentsByArtwork: Record<string, Comment[]>;
    onAddComment: (artworkId: string, text: string) => void;
    onDeleteComment: (artworkId: string, commentId: string) => void;
    collections: Collection[];
    onToggleArtworkInCollection: (collectionId: string, artworkId: string) => void;
    onCreateCollection: (name: string) => void;
    // Whose portfolio this is (for share links).
    ownerUsername: string;
    onPublishingUpdate?: (artworkId: string, fields: Partial<PublishingState>) => void;
};

export default function ArtworkShowcase({
    artworks,
    selectedIndex,

    editable = false,
    onRenderAdd,
    onDeleteRender,
    onInfoUpdate,
    onDeleteArtwork,
    likedArtworkIds,
    onToggleLike,
    commentsByArtwork,
    onAddComment,
    onDeleteComment,
    collections,
    onToggleArtworkInCollection,
    onCreateCollection,
    ownerUsername,
    onPublishingUpdate,
}: ArtworkShowcaseProps) {
    const [isSavePanelOpen, setIsSavePanelOpen] = useState(false);
    const [shareCopied, setShareCopied] = useState(false);
    const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
    const { user } = useAuth();
    const savePanelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (savePanelRef.current && !savePanelRef.current.contains(event.target as Node)) {
                setIsSavePanelOpen(false);
            }
        };

        if (isSavePanelOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isSavePanelOpen]);

    if (artworks.length === 0) {
        return (
            <div className="artwork-showcase empty">
                <div className="empty-state">
                    <ImageIcon />
                    <h3>No Artworks Yet</h3>
                    <p>
                        {editable
                            ? 'Click the yellow sphere in the 3D scene to add your first artwork'
                            : 'Switch to Edit Mode to add artworks'
                        }
                    </p>
                </div>
            </div>
        );
    }

    const artwork = artworks[selectedIndex];
    const info = artwork.infoData;
    const isLiked = !!likedArtworkIds[artwork.id];
    const isSaved = collections.some(c => c.artworkIds.includes(artwork.id));
    const comments = commentsByArtwork[artwork.id] ?? [];

    const toggleLiked = () => {
        onToggleLike(artwork.id);
    };

    const publishing = artwork.publishing;
    const status = publishing ? publishStatus(publishing.publishedAt) : 'published';

    const share = async () => {
        const url = `${window.location.origin}/u/${encodeURIComponent(ownerUsername)}?artwork=${artwork.id}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: info.title, url });
                return;
            }
            await navigator.clipboard.writeText(url);
            setShareCopied(true);
            setTimeout(() => setShareCopied(false), 2000);
        } catch {
            // Share sheet dismissed / clipboard unavailable - nothing to do.
        }
    };

    return (
        <div className="artwork-showcase">

            <div className="artwork-title">

                <div className="artwork-title-main">
                    <h2>{info.title}</h2>
                    <div className="artwork-badges">
                        {status !== 'published' && <span className={`content-badge ${status}`}>{status === 'draft' ? 'Draft' : 'Scheduled'}</span>}
                        {publishing && publishing.visibility !== 'public' && (
                            <span className={`content-badge ${publishing.visibility}`}>
                                {publishing.visibility === 'private' ? 'Private' : 'Unlisted'}
                            </span>
                        )}
                        {publishing?.isMature && <span className="content-badge mature">18+</span>}
                        {publishing?.aiGenerated && <span className="content-badge ai">AI generated</span>}
                        {publishing && (
                            <span className="artwork-views" title="Views"><EyeIcon width={14} height={14} /> {publishing.viewCount}</span>
                        )}
                    </div>
                </div>

                <div className="title-actions">
                    <button
                        className={`action-btn secondary ${isLiked ? 'active-like' : ''}`}
                        onClick={toggleLiked}
                    >
                        <HeartIcon fill={isLiked ? 'currentColor' : 'none'} />
                        {isLiked ? 'Liked' : 'Like'}
                        <span className="like-count">{artwork.likeCount}</span>
                    </button>
                    <div className="save-btn-container" ref={savePanelRef}>
                        <button
                            className={`action-btn secondary ${isSaved ? 'active-save' : ''}`}
                            onClick={() => setIsSavePanelOpen(prev => !prev)}
                        >
                            <BookmarkIcon fill={isSaved ? 'currentColor' : 'none'} />
                            {isSaved ? 'Saved' : 'Save'}
                        </button>
                        {isSavePanelOpen && (
                            <SaveToCollectionPanel
                                collections={collections}
                                artworkId={artwork.id}
                                onToggleArtwork={onToggleArtworkInCollection}
                                onCreateCollection={onCreateCollection}
                            />
                        )}
                    </div>
                    <button className="action-btn secondary" onClick={share} title="Share a link to this artwork">
                        <ShareIcon />
                        {shareCopied ? 'Link copied' : 'Share'}
                    </button>
                    {user && user.username !== ownerUsername && (
                        <button
                            className="action-btn secondary icon-only"
                            onClick={() => setReportTarget({ type: 'artwork', id: artwork.id, label: info.title || 'Untitled' })}
                            title="Report this artwork"
                            aria-label="Report this artwork"
                        >
                            <FlagIcon />
                        </button>
                    )}
                    {editable && (
                        <button
                            className="action-btn danger"
                            title="Delete artwork"
                            onClick={() => {
                                if (confirm(`Delete "${info.title || 'this artwork'}"? This can't be undone.`)) {
                                    onDeleteArtwork(artwork.id);
                                }
                            }}
                        >
                            <CloseIcon />
                            Delete
                        </button>
                    )}
                </div>

            </div>

            {editable && publishing && onPublishingUpdate && (
                <PublishingPanel
                    key={`publishing-${artwork.id}`}
                    publishing={publishing}
                    onChange={(fields) => onPublishingUpdate(artwork.id, fields)}
                />
            )}

            {publishing && <ListingBox key={`listing-${artwork.id}`} artworkId={artwork.id} editable={editable} />}

            <div className="showcase-content">

                <RenderGallery
                    renders={artwork.renders}
                    editable={editable}
                    onAdd={onRenderAdd}
                    onDelete={onDeleteRender}
                />

                <ArtworkInfo
                    key={artwork.id}
                    info={info}
                    editable={editable}
                    onUpdate={onInfoUpdate}
                    comments={comments}
                    onAddComment={(text) => onAddComment(artwork.id, text)}
                    onDeleteComment={(commentId) => onDeleteComment(artwork.id, commentId)}
                    onReportComment={(comment) => setReportTarget({ type: 'comment', id: comment.id, label: comment.text.slice(0, 120) })}
                />

            </div>

            {reportTarget && <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />}
        </div>
    );
}