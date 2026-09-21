import { useState, useEffect, useRef } from 'react';
import { SearchIcon, CloseIcon } from '@/frontend/svg/Icons';
import { useAuth } from '@/frontend/hooks/useAuth';
import { API_BASE_URL } from '@/frontend/config/api';

type SearchUser = {
  id: string;
  username: string;
  name: string;
};

type SearchArtwork = {
  id: string;
  title: string;
  category: string;
  year: string;
  username: string;
};

type SearchBarProps = {
  value: string;
  onChange: (query: string) => void;
  onSelectUser?: (username: string) => void;
  onSelectArtwork?: (username: string, artworkId: string) => void;
};

export default function SearchBar({ value, onChange, onSelectUser, onSelectArtwork }: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [userResults, setUserResults] = useState<SearchUser[]>([]);
  const [artworkResults, setArtworkResults] = useState<SearchArtwork[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { token } = useAuth();
  const requestIdRef = useRef(0);

  useEffect(() => {
    const query = value.trim();
    if (!token || query.length < 2) {
      setUserResults([]);
      setArtworkResults([]);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsSearching(true);

    const timeoutId = setTimeout(async () => {
      try {
        const [usersRes, artworksRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/users/search?q=${encodeURIComponent(query)}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE_URL}/api/artworks/search?q=${encodeURIComponent(query)}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (requestId !== requestIdRef.current) return;

        if (usersRes.ok) {
          const data = await usersRes.json();
          setUserResults(data.users ?? []);
        }
        if (artworksRes.ok) {
          const data = await artworksRes.json();
          setArtworkResults(data.artworks ?? []);
        }
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        if (requestId === requestIdRef.current) setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [value, token]);

  const showDropdown = isFocused && value.trim().length >= 2;
  const hasResults = userResults.length > 0 || artworkResults.length > 0;

  const handleSelectUser = (username: string) => {
    onSelectUser?.(username);
    onChange('');
    setUserResults([]);
    setArtworkResults([]);
  };

  const handleSelectArtwork = (username: string, artworkId: string) => {
    if (onSelectArtwork) {
      onSelectArtwork(username, artworkId);
    } else {
      onSelectUser?.(username);
    }
    onChange('');
    setUserResults([]);
    setArtworkResults([]);
  };

  return (
    <div className={`search-bar ${isFocused ? 'focused' : ''}`}>
      <SearchIcon className="search-icon" />
      <input
        type="text"
        className="search-input"
        placeholder="Search users or artworks..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 150)}
      />
      {value && (
        <button
          className="clear-search"
          onClick={() => onChange('')}
          title="Clear search"
        >
          <CloseIcon />
        </button>
      )}

      {showDropdown && (
        <div className="search-dropdown">
          {!token && (
            <div className="search-empty">Sign in to search</div>
          )}
          {token && isSearching && !hasResults && (
            <div className="search-empty">Searching...</div>
          )}
          {token && !isSearching && !hasResults && (
            <div className="search-empty">No results found</div>
          )}

          {userResults.length > 0 && (
            <div className="search-section-label">Users</div>
          )}
          {userResults.map((result) => (
            <button
              key={result.id}
              className="search-result-item"
              onMouseDown={() => handleSelectUser(result.username)}
            >
              <span className="search-result-name">{result.name}</span>
              <span className="search-result-username">@{result.username}</span>
            </button>
          ))}

          {artworkResults.length > 0 && (
            <div className="search-section-label">Artworks</div>
          )}
          {artworkResults.map((artwork) => (
            <button
              key={artwork.id}
              className="search-result-item"
              onMouseDown={() => handleSelectArtwork(artwork.username, artwork.id)}
            >
              <span className="search-result-name">{artwork.title}</span>
              <span className="search-result-username">
                by @{artwork.username}{artwork.category ? ` · ${artwork.category}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
