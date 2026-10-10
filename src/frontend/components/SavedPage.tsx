import { useEffect, useState } from 'react';
import '@/frontend/css/SavedPage.css';
import type { RemoteArtwork } from '@/types/PortfolioPiece';
import type { Collection } from '@/types/Collection';
import { BookmarkIcon, HeartIcon, ImageIcon, PlusIcon, ChevronDownIcon, CloseIcon, PencilIcon } from '@/frontend/svg/Icons';
import { API_BASE_URL } from '@/frontend/config/api';
import { assetUrl } from '@/frontend/utils/api';

type SavedPageProps = {
    collections: Collection[];
    onCreateCollection: (name: string) => void;
    onRenameCollection: (collectionId: string, name: string) => void;
    onDeleteCollection: (collectionId: string) => void;
    onSelectArtwork: (artworkId: string, username: string) => void;
};

export default function SavedPage({ collections, onCreateCollection, onRenameCollection, onDeleteCollection, onSelectArtwork }: SavedPageProps) {
    const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [collectionArtworks, setCollectionArtworks] = useState<RemoteArtwork[]>([]);

    const activeCollection = collections.find((c) => c.id === activeCollectionId) ?? null;
    const activeArtworkIdsKey = activeCollection ? activeCollection.artworkIds.slice().sort().join(',') : '';

    useEffect(() => {
        if (!activeArtworkIdsKey) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCollectionArtworks([]);
            return;
        }

        let cancelled = false;
        fetch(`${API_BASE_URL}/api/portfolio/artworks/batch?ids=${activeArtworkIdsKey}`)
            .then(res => (res.ok ? res.json() : []))
            .then((data: RemoteArtwork[]) => {
                if (!cancelled) setCollectionArtworks(data);
            })
            .catch(err => console.error('Failed to load saved artworks:', err));

        return () => {
            cancelled = true;
        };
    }, [activeArtworkIdsKey]);

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        const name = newName.trim();
        if (!name) return;

        onCreateCollection(name);
        setNewName('');
        setIsCreating(false);
    };

    const startRenaming = (currentName: string) => {
        setRenameValue(currentName);
        setIsRenaming(true);
    };

    const handleRenameSubmit = (e: React.FormEvent, collectionId: string) => {
        e.preventDefault();
        const name = renameValue.trim();
        if (!name) return;

        onRenameCollection(collectionId, name);
        setIsRenaming(false);
    };

    if (activeCollection) {
        return (
            <div className="saved-page">
                <button
                    className="saved-back-btn"
                    onClick={() => { setActiveCollectionId(null); setIsRenaming(false); }}
                >
                    <ChevronDownIcon className="saved-back-icon" />
                    Back to collections
                </button>

                <div className="activity-hero saved-detail-hero">
                    <div>
                        {isRenaming ? (
                            <form
                                className="collection-rename-form"
                                onSubmit={(e) => handleRenameSubmit(e, activeCollection.id)}
                            >
                                <input
                                    autoFocus
                                    type="text"
                                    className="collection-new-input"
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Escape') setIsRenaming(false); }}
                                />
                                <button type="submit" className="collection-new-confirm" disabled={!renameValue.trim()}>
                                    Save
                                </button>
                            </form>
                        ) : (
                            <h2 className="collection-rename-title">
                                {activeCollection.name}
                                <button
                                    className="collection-rename-btn"
                                    title="Rename collection"
                                    onClick={() => startRenaming(activeCollection.name)}
                                >
                                    <PencilIcon width={14} height={14} />
                                </button>
                            </h2>
                        )}
                        <p>{collectionArtworks.length} artwork{collectionArtworks.length === 1 ? '' : 's'} in this collection.</p>
                    </div>
                    <button
                        className="collection-delete-btn"
                        onClick={() => {
                            onDeleteCollection(activeCollection.id);
                            setActiveCollectionId(null);
                        }}
                    >
                        Delete collection
                    </button>
                </div>

                {collectionArtworks.length === 0 ? (
                    <div className="activity-empty">
                        <ImageIcon />
                        <h3>This collection is empty</h3>
                        <p>Save an artwork into it from the Save button on the artwork page.</p>
                    </div>
                ) : (
                    <div className="activity-grid">
                        {collectionArtworks.map((artwork) => (
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

    return (
        <div className="saved-page">
            <div className="activity-hero">
                <h2>Saved</h2>
                <p>Organize your favorite artworks into collections.</p>
            </div>

            <div className="collection-grid">
                {collections.map((collection) => (
                    <div key={collection.id} className="collection-card">
                        <button
                            className="collection-card-delete"
                            title="Delete collection"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDeleteCollection(collection.id);
                            }}
                        >
                            <CloseIcon />
                        </button>
                        <button
                            className="collection-card-main"
                            onClick={() => setActiveCollectionId(collection.id)}
                        >
                            <div className="collection-card-icon">
                                <BookmarkIcon />
                            </div>
                            <h3 className="collection-card-title" title={collection.name}>{collection.name}</h3>
                            <p className="collection-card-meta">
                                {collection.artworkIds.length} artwork{collection.artworkIds.length === 1 ? '' : 's'}
                            </p>
                        </button>
                    </div>
                ))}

                {isCreating ? (
                    <form className="collection-card collection-card-new-form" onSubmit={handleCreate}>
                        <input
                            autoFocus
                            type="text"
                            className="collection-new-input"
                            placeholder="Collection name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onBlur={() => { if (!newName.trim()) setIsCreating(false); }}
                        />
                        <button type="submit" className="collection-new-confirm" disabled={!newName.trim()}>
                            Create
                        </button>
                    </form>
                ) : (
                    <button className="collection-card collection-card-new" onClick={() => setIsCreating(true)}>
                        <PlusIcon />
                        <span>New collection</span>
                    </button>
                )}
            </div>

            {collections.length === 0 && !isCreating && (
                <div className="activity-empty">
                    <BookmarkIcon />
                    <h3>No collections yet</h3>
                    <p>Create a collection to start organizing saved artworks.</p>
                </div>
            )}
        </div>
    );
}
