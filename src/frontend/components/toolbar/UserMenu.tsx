import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/frontend/hooks/useAuth';
import {
  ChevronDownIcon,
  PersonIcon,
  HeartIcon,
  CommentIcon,
  BookmarkIcon,
  SettingsIcon,
  // HelpIcon,
  LogoutIcon,
  ShieldIcon,
  MessageIcon,
  CompassIcon,
  BriefcaseIcon,
  StoreIcon,
  ChartIcon,
} from '@/frontend/svg/Icons';
import { useNavigate } from 'react-router-dom';

type UserMenuProps = {
  onProfileClick?: () => void;
  onLikedPostsClick?: () => void;
  onMyCommentsClick?: () => void;
  onSavedClick?: () => void;
  onSettingsClick?: () => void;
};

export default function UserMenu({ onProfileClick, onLikedPostsClick, onMyCommentsClick, onSavedClick, onSettingsClick }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const goTo = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to sign out?')) {
      logout();
      setIsOpen(false);
    }
  };

  const handleProfileClick = () => {
    onProfileClick?.();
    setIsOpen(false);
  };

  const handleLikedPostsClick = () => {
    onLikedPostsClick?.();
    setIsOpen(false);
  };

  const handleMyCommentsClick = () => {
    onMyCommentsClick?.();
    setIsOpen(false);
  };

  const handleSavedClick = () => {
    onSavedClick?.();
    setIsOpen(false);
  };

  const handleSettingsClick = () => {
    onSettingsClick?.();
    setIsOpen(false);
  };

  if (!user) return null;

  const avatarLetter = user.username.charAt(0).toUpperCase();

  return (
    <div className="user-menu-container" ref={menuRef}>
      <button
        className="user-menu-button"
        onClick={() => setIsOpen(!isOpen)}
        title="User menu"
      >
        <div className="user-avatar-small">
          {avatarLetter}
        </div>
        <ChevronDownIcon className={`chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="user-dropdown">
          <div className="user-dropdown-header">
            <div className="user-avatar-large">
              {avatarLetter}
            </div>
            <div>
              <p className="user-name">{user.username}</p>
              <p className="user-email">{user.email}</p>
            </div>
          </div>
          <div className="user-dropdown-divider"></div>
          <button className="user-dropdown-item" onClick={handleProfileClick}>
            <PersonIcon />
            <span>Profile</span>
          </button>
          <button className="user-dropdown-item" onClick={handleLikedPostsClick}>
            <HeartIcon />
            <span>Liked Posts</span>
          </button>
          <button className="user-dropdown-item" onClick={handleMyCommentsClick}>
            <CommentIcon />
            <span>My Comments</span>
          </button>
          <button className="user-dropdown-item" onClick={() => goTo('/analytics')}>
            <ChartIcon />
            <span>Analytics</span>
          </button>
          <button className="user-dropdown-item" onClick={() => goTo('/messages')}>
            <MessageIcon />
            <span>Messages</span>
          </button>
          <button className="user-dropdown-item" onClick={handleSavedClick}>
            <BookmarkIcon />
            <span>Saved</span>
          </button>
          <button className="user-dropdown-item" onClick={handleSettingsClick}>
            <SettingsIcon />
            <span>Settings</span>
          </button>
          {/* The toolbar nav is hidden on phones - keep it reachable here. */}
          <div className="user-dropdown-mobile-nav">
            <div className="user-dropdown-divider"></div>
            <button className="user-dropdown-item" onClick={() => goTo('/')}><CompassIcon /><span>Explore</span></button>
            <button className="user-dropdown-item" onClick={() => goTo('/jobs')}><BriefcaseIcon /><span>Jobs</span></button>
            <button className="user-dropdown-item" onClick={() => goTo('/marketplace')}><StoreIcon /><span>Marketplace</span></button>
          </div>
          {user.role === 'admin' && (
            <button className="user-dropdown-item" onClick={() => goTo('/admin')}>
              <ShieldIcon />
              <span>Moderation</span>
            </button>
          )}
          {/* <button className="user-dropdown-item">
            <HelpIcon />
            <span>Help & Support</span>
          </button> */}
          <div className="user-dropdown-divider"></div>
          <button className="user-dropdown-item danger" onClick={handleLogout}>
            <LogoutIcon />
            <span>Log out</span>
          </button>
        </div>
      )}
    </div>
  );
}
