import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/frontend/hooks/useAuth';
import { apiFetch, queryString } from '@/frontend/utils/api';
import ArtworkCard from '@/frontend/components/explore/ArtworkCard';
import { SearchIcon } from '@/frontend/svg/Icons';
import { LICENSE_LABELS, formatPrice, type MarketplaceItem, type License } from '@/types/Community';
import '@/frontend/css/Explore.css';
import '@/frontend/css/Community.css';
import '@/frontend/css/Jobs.css';

type MarketplacePageProps = {
  onOpenArtwork: (username: string, artworkId: string) => void;
  onOpenUser: (username: string) => void;
};

const PAGE_SIZE = 24;

// Models listed for download/sale. Opening one goes to the artwork page,
// where the buy/download box lives.
export default function MarketplacePage({ onOpenArtwork, onOpenUser }: MarketplacePageProps) {
  const { user, token } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const price = params.get('price') ?? '';
  const license = params.get('license') ?? '';
  const sort = params.get('sort') ?? 'newest';

  const [items, setItems] = useState<MarketplaceItem[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState(q);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const load = (offset: number) => apiFetch<{ items: MarketplaceItem[]; hasMore: boolean }>(
    `/api/marketplace${queryString({ q, price, license, sort, limit: PAGE_SIZE, offset })}`,
    { token }
  );

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ items: MarketplaceItem[]; hasMore: boolean }>(
      `/api/marketplace${queryString({ q, price, license, sort, limit: PAGE_SIZE, offset: 0 })}`,
      { token }
    )
      .then(page => {
        if (cancelled) return;
        setItems(page.items);
        setHasMore(page.hasMore);
      })
      .catch(err => console.error('Failed to load marketplace:', err));
    return () => { cancelled = true; };
  }, [q, price, license, sort, token]);

  return (
    <div className="community-page">
      <div className="community-page-header">
        <div>
          <h2>Marketplace</h2>
          <p>Game-ready models, kitbash parts and props - free downloads and assets for sale.</p>
        </div>
        <form className="explore-search" onSubmit={(e) => { e.preventDefault(); setParam('q', search.trim()); }}>
          <SearchIcon />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assets" aria-label="Search assets" />
        </form>
      </div>

      <div className="jobs-filters market-filters">
        <div className="explore-chip-row">
          {[['', 'All'], ['free', 'Free'], ['paid', 'Paid']].map(([value, label]) => (
            <button key={value} className={`explore-chip ${price === value ? 'active' : ''}`} onClick={() => setParam('price', value)}>{label}</button>
          ))}
        </div>
        <select value={license} onChange={(e) => setParam('license', e.target.value)} aria-label="License">
          <option value="">Any license</option>
          {(Object.keys(LICENSE_LABELS) as License[]).map(l => <option key={l} value={l}>{LICENSE_LABELS[l].label}</option>)}
        </select>
        <select value={sort} onChange={(e) => setParam('sort', e.target.value === 'newest' ? '' : e.target.value)} aria-label="Sort">
          <option value="newest">Newest</option>
          <option value="popular">Most downloaded</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </select>
      </div>

      {items === null && <div className="explore-loading"><div className="loading-spinner" /></div>}
      {items?.length === 0 && (
        <p className="empty-note">
          Nothing listed here yet. Owners can list an artwork from its page (edit mode → Marketplace).
        </p>
      )}

      <div className="explore-grid">
        {items?.map(item => (
          <ArtworkCard
            key={item.id}
            artwork={{ ...item, id: item.artworkId }}
            showMature={!!user?.showMature}
            onOpen={() => onOpenArtwork(item.username, item.artworkId)}
            onOpenAuthor={() => onOpenUser(item.username)}
            badge={<span className={`content-badge price ${item.priceCents === 0 ? 'free' : ''}`}>{formatPrice(item.priceCents, item.currency)}</span>}
          />
        ))}
      </div>

      {hasMore && items && (
        <button
          className="explore-more"
          onClick={() => load(items.length).then(page => {
            setItems(prev => [...(prev ?? []), ...page.items]);
            setHasMore(page.hasMore);
          })}
        >
          Load more
        </button>
      )}
    </div>
  );
}
