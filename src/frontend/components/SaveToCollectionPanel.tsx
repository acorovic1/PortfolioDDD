import { useState } from 'react';
import '@/frontend/css/SaveToCollectionPanel.css';
import type { Collection } from '@/types/Collection';
import { CheckIcon, PlusIcon } from '@/frontend/svg/Icons';

type SaveToCollectionPanelProps = {
    collections: Collection[];
    artworkId: string;
    onToggleArtwork: (collectionId: string, artworkId: string) => void;
    onCreateCollection: (name: string) => void;
};

export default function SaveToCollectionPanel({
    collections,
    artworkId,
    onToggleArtwork,
    onCreateCollection,
}: SaveToCollectionPanelProps) {
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        const name = newName.trim();
        if (!name) return;

        onCreateCollection(name);
        setNewName('');
        setIsCreating(false);
    };

    return (
        <div className="save-panel">
            <div className="save-panel-header">Save to collection</div>

            <div className="save-panel-list">
                {collections.length === 0 && !isCreating && (
                    <p className="save-panel-empty">No collections yet.</p>
                )}

                {collections.map((collection) => {
                    const isInCollection = collection.artworkIds.includes(artworkId);
                    return (
                        <button
                            key={collection.id}
                            className="save-panel-item"
                            onClick={() => onToggleArtwork(collection.id, artworkId)}
                        >
                            <span className={`save-panel-checkbox ${isInCollection ? 'checked' : ''}`}>
                                {isInCollection && <CheckIcon />}
                            </span>
                            <span className="save-panel-item-name">{collection.name}</span>
                            <span className="save-panel-item-count">{collection.artworkIds.length}</span>
                        </button>
                    );
                })}
            </div>

            <div className="save-panel-divider" />

            {isCreating ? (
                <form className="save-panel-new-form" onSubmit={handleCreate}>
                    <input
                        autoFocus
                        type="text"
                        className="save-panel-new-input"
                        placeholder="Collection name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                    />
                    <button type="submit" className="save-panel-new-confirm" disabled={!newName.trim()}>
                        <PlusIcon />
                    </button>
                </form>
            ) : (
                <button className="save-panel-new-btn" onClick={() => setIsCreating(true)}>
                    <PlusIcon />
                    <span>New collection</span>
                </button>
            )}
        </div>
    );
}
