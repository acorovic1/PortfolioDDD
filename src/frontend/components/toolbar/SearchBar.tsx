import { useState, useEffect, useRef } from 'react';
import { SearchIcon, CloseIcon } from '@/frontend/svg/Icons';
import { useAuth } from '@/frontend/hooks/useAuth';
import { API_BASE_URL } from '@/frontend/config/api';
import { useI18n } from '@/frontend/hooks/useI18n';

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
  // Enter, or "See all results": the full results (Explore, as a grid).
  onSearchAll?: (query: string) => void;
};

// The site's one search box: quick results (people and artworks) while
// typing, and the full results in Explore on Enter.
export default function SearchBar({ value, onChange, onSelectUser, onSelectArtwork, onSearchAll }: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const { t } = useI18n();
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

  const query = value.trim();
  const showDropdown = isFocused && query.length >= 2;
  const hasResults = userResults.length > 0 || artworkResults.length > 0;

  const searchAll = () => {
    if (!query || !onSearchAll) return;
    onSearchAll(query);
    setIsFocused(false);
  };

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
    <form
      role="search"
      className={`search-bar ${isFocused ? 'focused' : ''}`}
      onSubmit={(e) => { e.preventDefault(); searchAll(); }}
    >
      <SearchIcon className="search-icon" />
      <input
        type="text"
        className="search-input"
        placeholder={t('search.placeholder')}
        aria-label={t('search.placeholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 150)}
        onKeyDown={(e) => { if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
      />
      {value && (
        <button
          type="button"
          className="clear-search"
          onClick={() => onChange('')}
          title={t('search.clear')}
        >
          <CloseIcon />
        </button>
      )}

      {showDropdown && (
        <div className="search-dropdown">
          {token && isSearching && !hasResults && (
            <div className="search-empty">{t('search.searching')}</div>
          )}
          {token && !isSearching && !hasResults && (
            <div className="search-empty">{t('search.noResults')}</div>
          )}

          {userResults.length > 0 && (
            <div className="search-section-label">{t('search.users')}</div>
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
            <div className="search-section-label">{t('search.artworks')}</div>
          )}
          {artworkResults.map((artwork) => (
            <button
              key={artwork.id}
              className="search-result-item"
              onMouseDown={() => handleSelectArtwork(artwork.username, artwork.id)}
            >
              <span className="search-result-name">{artwork.title}</span>
              <span className="search-result-username">
                {t('search.by', { username: artwork.username })}{artwork.category ? ` · ${artwork.category}` : ''}
              </span>
            </button>
          ))}

          {/* Signed out there are no quick results, but Explore works. When
              the quick search found nothing, neither would Explore. */}
          {onSearchAll && !(token && !isSearching && !hasResults) && (
            <button type="button" className="search-result-item search-all" onMouseDown={searchAll}>
              <span className="search-result-name">{t('search.seeAll', { query })}</span>
              <span className="search-result-username">{t('search.seeAllHint')}</span>
            </button>
          )}
        </div>
      )}
    </form>
  );
}
