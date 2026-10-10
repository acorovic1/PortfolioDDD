import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/frontend/hooks/useAuth';
import { apiFetch, assetUrl } from '@/frontend/utils/api';
import { DownloadIcon, StoreIcon } from '@/frontend/svg/Icons';
import { LICENSE_LABELS, formatPrice, type Listing, type License } from '@/types/Community';
import '@/frontend/css/Community.css';

type ListingBoxProps = {
  artworkId: string;
  // The artwork's owner in edit mode: shows the listing editor instead.
  editable: boolean;
};

function SellerEditor({ artworkId, listing, onSaved }: { artworkId: string; listing: Listing | null; onSaved: (l: Listing | null) => void }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(listing ? (listing.priceCents / 100).toFixed(2) : '0');
  const [license, setLicense] = useState<License>(listing?.license ?? 'personal');
  const [description, setDescription] = useState(listing?.description ?? '');
  const [error, setError] = useState('');

  const save = async (isActive: boolean) => {
    setError('');
    const cents = Math.round(Number(price) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      setError('Enter a price (0 for a free download)');
      return;
    }
    try {
      onSaved(await apiFetch<Listing>(`/api/marketplace/artworks/${artworkId}`, {
        method: 'PUT',
        token,
        body: { priceCents: cents, license, description: description.trim() || undefined, isActive },
      }));
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async () => {
    await apiFetch(`/api/marketplace/artworks/${artworkId}`, { method: 'DELETE', token });
    onSaved(null);
    setOpen(false);
  };

  if (!open) {
    return (
      <div className="listing-box seller">
        <StoreIcon />
        <span>
          {listing
            ? <>{listing.isActive ? 'Listed' : 'Unlisted'} on the marketplace · <strong>{formatPrice(listing.priceCents, listing.currency)}</strong> · {listing.downloads} downloads</>
            : 'Not on the marketplace'}
        </span>
        <button className="btn small" onClick={() => setOpen(true)}>{listing ? 'Edit listing' : 'Sell or share this model'}</button>
      </div>
    );
  }

  return (
    <div className="listing-box seller editing">
      <div className="form-row">
        <label className="form-field">Price (USD, 0 = free)
          <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="form-field">License
          <select value={license} onChange={(e) => setLicense(e.target.value as License)}>
            {(Object.keys(LICENSE_LABELS) as License[]).map(l => <option key={l} value={l}>{LICENSE_LABELS[l].label} - {LICENSE_LABELS[l].hint}</option>)}
          </select>
        </label>
      </div>
      <label className="form-field">What's included
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} placeholder="Formats, poly count, texture resolution…" />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="job-owner-actions">
        <button className="btn primary small" onClick={() => save(true)}>{listing ? 'Save' : 'List it'}</button>
        {listing?.isActive && <button className="btn small" onClick={() => save(false)}>Pause listing</button>}
        {listing && <button className="btn small danger" onClick={remove}>Remove</button>}
        <button className="btn small" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

// Marketplace box on an artwork page: buy/download for visitors, listing
// editor for the owner in edit mode.
export default function ListingBox({ artworkId, editable }: ListingBoxProps) {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const onRequireLogin = () => navigate('/login');
  const [listing, setListing] = useState<Listing | null | undefined>(undefined);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiFetch<Listing | null>(`/api/marketplace/artworks/${artworkId}`, { token })
      .then(data => { if (!cancelled) setListing(data); })
      .catch(() => { if (!cancelled) setListing(undefined); });
    return () => { cancelled = true; };
  }, [artworkId, token]);

  if (listing === undefined) return null;
  if (editable) return <SellerEditor key={listing?.id ?? 'new'} artworkId={artworkId} listing={listing} onSaved={setListing} />;
  if (!listing || listing.isSeller) return null;

  const download = async () => {
    if (!user) return onRequireLogin();
    const { url, fileName } = await apiFetch<{ url: string; fileName: string }>(`/api/marketplace/listings/${listing.id}/download`, { method: 'POST', token });
    // Fetch as a blob so the file downloads under a readable name.
    const blob = await (await fetch(assetUrl(url)!)).blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
    setListing(prev => prev && { ...prev, downloads: prev.downloads + 1 });
  };

  const requestPurchase = async () => {
    if (!user) return onRequireLogin();
    try {
      await apiFetch(`/api/marketplace/listings/${listing.id}/purchase-request`, { method: 'POST', token, body: {} });
      setStatus('Request sent - the seller will reply in your messages to arrange payment and delivery.');
    } catch (err) {
      setStatus((err as Error).message);
    }
  };

  const free = listing.priceCents === 0;
  return (
    <div className="listing-box">
      <div className="listing-price">
        <strong>{formatPrice(listing.priceCents, listing.currency)}</strong>
        <span title={LICENSE_LABELS[listing.license].hint}>{LICENSE_LABELS[listing.license].label} license</span>
      </div>
      {listing.description && <p>{listing.description}</p>}
      {free ? (
        <button className="btn primary" onClick={download}><DownloadIcon /> Download GLB</button>
      ) : (
        <button className="btn primary" onClick={requestPurchase}><StoreIcon /> Request to buy</button>
      )}
      <small>{listing.downloads} downloads{!free && ' · payment is arranged with the seller'}</small>
      {status && <p className="job-status">{status}</p>}
    </div>
  );
}
