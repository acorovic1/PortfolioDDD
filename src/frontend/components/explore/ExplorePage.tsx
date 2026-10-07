import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/frontend/hooks/useAuth';
import { apiFetch, queryString } from '@/frontend/utils/api';
import type { FeedArtwork, FeedFacets, FeedTab, ViewSource } from '@/types/Feed';
import ArtworkCard from './ArtworkCard';
import { CloseIcon, SearchIcon } from '@/frontend/svg/Icons';
import '@/frontend/css/Explore.css';

const PAGE_SIZE = 24;

const TABS: { id: FeedTab; label: string; needsAuth?: boolean }[] = [
  { id: 'trending', label: 'Trending' },
  { id: 'latest', label: 'Latest' },
  { id: 'following', label: 'Following', needsAuth: true },
];

type ExplorePageProps = {
  onOpenArtwork: (username: string, artworkId: string, source: ViewSource) => void;
  onOpenUser: (username: string) => void;
};

// The discovery feed: trending / latest / following, filterable by
// category, tag, software and text. Filters live in the URL, so tag links
// elsewhere in the app (e.g. on an artwork) can open a filtered explore page.
export default function ExplorePage({ onOpenArtwork, onOpenUser }: ExplorePageProps) {
  const { user, token } = useAuth();
  const [params, setParams] = useSearchParams();

  const requestedTab = params.get('tab') as FeedTab | null;
  const tab: FeedTab = TABS.some(t => t.id === requestedTab) && (requestedTab !== 'following' || user)
    ? requestedTab!
    : 'trending';
  const category = params.get('category') ?? '';
  const tag = params.get('tag') ?? '';
  const tool = params.get('tool') ?? '';
  const q = params.get('q') ?? '';

  const [artworks, setArtworks] = useState<FeedArtwork[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [facets, setFacets] = useState<FeedFacets | null>(null);
  const [searchDraft, setSearchDraft] = useState(q);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  // `offset` 0 replaces the list (new filters), otherwise appends a page.
  const load = useCallback((offset: number, signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    apiFetch<{ artworks: FeedArtwork[]; hasMore: boolean }>(
      `/api/feed${queryString({ tab, category, tag, tool, q, limit: PAGE_SIZE, offset })}`,
      { token, signal }
    )
      .then(page => {
        setArtworks(prev => (offset === 0 ? page.artworks : [...prev, ...page.artworks]));
        setHasMore(page.hasMore);
      })
      .catch(err => {
        if ((err as Error).name !== 'AbortError') setError((err as Error).message);
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  }, [tab, category, tag, tool, q, token]);

  useEffect(() => {
    const controller = new AbortController();
    // Fetch on filter change; load() flips the loading state first.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(0, controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    apiFetch<FeedFacets>('/api/feed/facets', { token })
      .then(setFacets)
      .catch(err => console.error('Failed to load explore filters:', err));
  }, [token]);

  const activeFilters = [
    category && { key: 'category', label: category },
    tag && { key: 'tag', label: `#${tag}` },
    tool && { key: 'tool', label: tool },
    q && { key: 'q', label: `“${q}”` },
  ].filter(Boolean) as { key: string; label: string }[];

  const source: ViewSource = tab === 'following' ? 'following' : 'explore';

  return (
    <div className="explore-page">
      <header className="explore-header">
        <div>
          <h2>Explore</h2>
          <p>Discover 3D work from the community.</p>
        </div>
        <form
          className="explore-search"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter('q', searchDraft.trim());
          }}
        >
          <SearchIcon />
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search artworks or artists"
            aria-label="Search artworks"
          />
        </form>
      </header>

      <nav className="explore-tabs" aria-label="Feeds">
        {TABS.filter(t => !t.needsAuth || user).map(t => (
          <button
            key={t.id}
            className={`explore-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setFilter('tab', t.id === 'trending' ? '' : t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {facets && (
        <div className="explore-filters">
          {facets.categories.length > 0 && (
            <div className="explore-chip-row" aria-label="Categories">
              {facets.categories.map(c => (
                <button
                  key={c.name}
                  className={`explore-chip ${category.toLowerCase() === c.name.toLowerCase() ? 'active' : ''}`}
                  onClick={() => setFilter('category', category.toLowerCase() === c.name.toLowerCase() ? '' : c.name)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <div className="explore-chip-row secondary">
            {facets.tools.length > 0 && (
              <select value={tool} onChange={(e) => setFilter('tool', e.target.value)} aria-label="Software">
                <option value="">Any software</option>
                {facets.tools.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
            )}
            {facets.tags.slice(0, 15).map(t => (
              <button
                key={t.name}
                className={`explore-chip tag ${tag === t.name ? 'active' : ''}`}
                onClick={() => setFilter('tag', tag === t.name ? '' : t.name)}
              >
                #{t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeFilters.length > 0 && (
        <div className="explore-active">
          {activeFilters.map(f => (
            <button key={f.key} className="explore-pill" onClick={() => {
              if (f.key === 'q') setSearchDraft('');
              setFilter(f.key, '');
            }}>
              {f.label} <CloseIcon width={12} height={12} />
            </button>
          ))}
        </div>
      )}

      {error && <p className="explore-error" role="alert">{error}</p>}

      {!loading && !error && artworks.length === 0 && (
        <div className="explore-empty">
          <h3>{tab === 'following' ? 'Nothing from people you follow yet' : 'No artworks found'}</h3>
          <p>
            {tab === 'following'
              ? 'Follow artists from their profile to see their new work here.'
              : activeFilters.length > 0 ? 'Try removing a filter.' : 'Be the first to publish something!'}
          </p>
        </div>
      )}

      <div className="explore-grid">
        {artworks.map(artwork => (
          <ArtworkCard
            key={artwork.id}
            artwork={artwork}
            showMature={!!user?.showMature}
            onOpen={() => onOpenArtwork(artwork.username, artwork.id, source)}
            onOpenAuthor={() => onOpenUser(artwork.username)}
          />
        ))}
      </div>

      {loading && <div className="explore-loading"><div className="loading-spinner" /></div>}
      {!loading && hasMore && (
        <button className="explore-more" onClick={() => load(artworks.length)}>Load more</button>
      )}
    </div>
  );
}
