import { useState } from 'react';
import ViewModeToggle from './ViewModeToggle';
import SearchBar from './SearchBar';
import UserMenu from './UserMenu';
import NotificationBell from '@/frontend/components/NotificationBell';
import MessagesButton from './MessagesButton';
import '@/frontend/css/Toolbar.css';
import { Logo, PersonIcon } from '@/frontend/svg/Icons';
import { useAuth } from '@/frontend/hooks/useAuth';

type ToolbarProps = {
    onViewModeChange?: (mode: 'view' | 'edit') => void;
    onSearch?: (query: string) => void;
    onLogoClick?: () => void;
    onLoginClick?: () => void;
    onProfileClick?: () => void;
    onLikedPostsClick?: () => void;
    onMyCommentsClick?: () => void;
    onSavedClick?: () => void;
    onSettingsClick?: () => void;
    onSelectUser?: (username: string) => void;
    onSelectArtwork?: (username: string, artworkId: string) => void;
    showViewModeToggle?: boolean;
};

export default function Toolbar({ onViewModeChange, onSearch, onLogoClick, onLoginClick, onProfileClick, onLikedPostsClick, onMyCommentsClick, onSavedClick, onSettingsClick, onSelectUser, onSelectArtwork, showViewModeToggle = true }: ToolbarProps) {
    const [viewMode, setViewMode] = useState<'view' | 'edit'>('view');
    const [searchQuery, setSearchQuery] = useState('');
    const { user } = useAuth();

    const handleViewModeToggle = () => {
        const newMode = viewMode === 'view' ? 'edit' : 'view';
        setViewMode(newMode);
        onViewModeChange?.(newMode);
    };

    const handleSearch = (query: string) => {
        setSearchQuery(query);
        onSearch?.(query);
    };

    return (
        <header className="toolbar">
            <div className="toolbar-left">
                <button className="logo" onClick={onLogoClick} title="Go to home page">
                    <Logo />
                    <h1 className="toolbar-title"> Portfolio </h1>
                </button>
            </div>

            <div className="toolbar-center">
                <SearchBar value={searchQuery} onChange={handleSearch} onSelectUser={onSelectUser} onSelectArtwork={onSelectArtwork} />
            </div>

            <div className="toolbar-right">
                {showViewModeToggle && (
                    <ViewModeToggle mode={viewMode} onToggle={handleViewModeToggle} />
                )}

                {user ? (
                    <>
                        <MessagesButton />
                        <NotificationBell />
                        <button className="profile-icon-btn" onClick={onProfileClick} title="Go to your profile">
                            <PersonIcon />
                        </button>
                        <UserMenu
                            onProfileClick={onProfileClick}
                            onLikedPostsClick={onLikedPostsClick}
                            onMyCommentsClick={onMyCommentsClick}
                            onSavedClick={onSavedClick}
                            onSettingsClick={onSettingsClick}
                        />
                    </>
                ) : (
                    <button className="login-button" onClick={onLoginClick}>
                        Login
                    </button>
                )}
            </div>
        </header>
    );
}
