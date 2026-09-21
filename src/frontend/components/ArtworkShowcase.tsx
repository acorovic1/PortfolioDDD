import { useEffect, useRef, useState } from 'react';
import type { PortfolioPiece } from '@/types/PortfolioPiece';
import type { Comment } from '@/types/Comment';
import type { Collection } from '@/types/Collection';
import RenderGallery from './RenderGallery';
import ArtworkInfo from '@/frontend/components/ArtworkInfo';
import SaveToCollectionPanel from '@/frontend/components/SaveToCollectionPanel';
import '../css/ArtworkShowcase.css';
import '../css/ArtworkInfo.css';
import type { ArtworkInfoData } from '@/types/ArtworkInfoData';
import { ImageIcon, HeartIcon, BookmarkIcon, CloseIcon } from '@/frontend/svg/Icons';

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


}: ArtworkShowcaseProps) {
    const [isSavePanelOpen, setIsSavePanelOpen] = useState(false);
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

    return (
        <div className="artwork-showcase">

            <div className="artwork-title">

                <h2>{info.title}</h2>

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
                />

            </div>


        </div>
    );
}