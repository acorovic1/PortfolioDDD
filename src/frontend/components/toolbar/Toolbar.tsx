import { useState } from 'react';
import ViewModeToggle from './ViewModeToggle';
import SearchBar from './SearchBar';
import UserMenu from './UserMenu';
import NotificationBell from '@/frontend/components/NotificationBell';
import MessagesButton from './MessagesButton';
import '@/frontend/css/Toolbar.css';
import { Logo, PersonIcon, CompassIcon, BriefcaseIcon, StoreIcon } from '@/frontend/svg/Icons';
import { NavLink } from 'react-router-dom';

const NAV_LINKS = [
    { to: '/explore', label: 'nav.explore', icon: CompassIcon },
    { to: '/jobs', label: 'nav.jobs', icon: BriefcaseIcon },
    { to: '/marketplace', label: 'nav.marketplace', icon: StoreIcon },
] as const;
import { useAuth } from '@/frontend/hooks/useAuth';
import { useI18n } from '@/frontend/hooks/useI18n';

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
    const { t } = useI18n();

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
                <button className="logo" onClick={onLogoClick} title={t('nav.home')}>
                    <Logo />
                    <h1 className="toolbar-title"> Portfolio </h1>
                </button>
                <nav className="toolbar-nav" aria-label={t('nav.main')}>
                    {NAV_LINKS.map(({ to, label, icon: Icon }) => (
                        <NavLink key={to} to={to} className="toolbar-nav-link" title={t(label)}>
                            <Icon />
                            <span>{t(label)}</span>
                        </NavLink>
                    ))}
                </nav>
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
                        <button className="profile-icon-btn" onClick={onProfileClick} title={t('nav.profile')}>
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
                        {t('nav.login')}
                    </button>
                )}
            </div>
        </header>
    );
}
