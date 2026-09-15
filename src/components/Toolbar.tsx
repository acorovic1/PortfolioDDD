import { useState } from 'react';
import ViewModeToggle from './ViewModeToggle';
import SearchBar from './SearchBar';
import NotificationBell from './NotificationBell';
import UserMenu from './UserMenu';
import '../css/Toolbar.css';
import Logo from './Logo';

type ToolbarProps = {
    onViewModeChange?: (mode: 'view' | 'edit') => void;
    onSearch?: (query: string) => void;
};

export default function Toolbar({ onViewModeChange, onSearch }: ToolbarProps) {
    const [viewMode, setViewMode] = useState<'view' | 'edit'>('view');
    const [searchQuery, setSearchQuery] = useState('');

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
                <div className="logo">
                    <Logo />
                    <h1 className="toolbar-title"> Portfolio </h1>
                </div>
            </div>

            <div className="toolbar-center">
                <SearchBar value={searchQuery} onChange={handleSearch} />
            </div>

            <div className="toolbar-right">
                <ViewModeToggle mode={viewMode} onToggle={handleViewModeToggle} />
                
                <UserMenu />
            </div>
        </header>
    );
}