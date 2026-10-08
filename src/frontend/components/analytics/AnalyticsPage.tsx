import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/frontend/hooks/useAuth';
import { apiFetch } from '@/frontend/utils/api';
import { LineChart, BarList } from './charts';
import { compactNumber } from '@/frontend/utils/format';
import '@/frontend/css/Community.css';
import '@/frontend/css/Analytics.css';

type Totals = { views: number; likes: number; comments: number; followers: number; downloads: number };

type Analytics = {
  days: number;
  current: Totals;
  previous: Totals;
  allTime: { views: number; likes: number; followers: number; artworks: number };
  daily: { date: string; views: number; likes: number; followers: number }[];
  sources: { source: string; views: number }[];
  topArtworks: { id: string; title: string; views: number; likes: number; comments: number }[];
};

const RANGES = [7, 30, 90];

const SOURCE_LABELS: Record<string, string> = {
  explore: 'Explore',
  following: 'Following feed',
  search: 'Search',
  profile: 'Your profile',
  notification: 'Notifications',
  challenge: 'Challenges',
  marketplace: 'Marketplace',
  external: 'Other websites',
  direct: 'Direct / shared links',
};

function StatTile({ label, value, previous, days }: { label: string; value: number; previous: number; days: number }) {
  const delta = value - previous;
  const percent = previous > 0 ? Math.round((delta / previous) * 100) : null;
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{compactNumber(value)}</strong>
      <span className={`stat-delta ${direction}`}>
        {direction === 'up' ? '▲' : direction === 'down' ? '▼' : '–'}{' '}
        {direction === 'flat' ? 'No change' : `${delta > 0 ? '+' : ''}${delta.toLocaleString()}${percent !== null ? ` (${percent > 0 ? '+' : ''}${percent}%)` : ''}`}
        <span className="stat-delta-period"> vs previous {days} days</span>
      </span>
    </div>
  );
}

function DataTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: (string | number)[][] }) {
  return (
    <details className="viz-table">
      <summary>Show as table</summary>
      <table>
        <caption>{caption}</caption>
        <thead><tr>{columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{typeof cell === 'number' ? cell.toLocaleString() : cell}</td>)}</tr>)}
        </tbody>
      </table>
    </details>
  );
}

type AnalyticsPageProps = {
  onOpenArtwork: (artworkId: string) => void;
};

// A creator's own stats: engagement totals with period-over-period change,
// daily trends, where views come from, and best-performing artworks.
export default function AnalyticsPage({ onOpenArtwork }: AnalyticsPageProps) {
  const { token } = useAuth();
  const [params, setParams] = useSearchParams();
  const days = RANGES.includes(Number(params.get('days'))) ? Number(params.get('days')) : 30;
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiFetch<Analytics>(`/api/analytics/me?days=${days}`, { token })
      .then(result => { if (!cancelled) setData(result); })
      .catch(err => { if (!cancelled) setError((err as Error).message); });
    return () => { cancelled = true; };
  }, [days, token]);

  // While a new range loads, keep the previous render (dimmed) - no jump.
  const loading = !data || data.days !== days;

  const series = (key: 'views' | 'likes' | 'followers') => data?.daily.map(d => ({ date: d.date, value: d[key] })) ?? [];
  const tableRows = (key: 'views' | 'likes' | 'followers') => data?.daily.map(d => [d.date, d[key]]) ?? [];

  return (
    <div className="community-page analytics-page">
      <div className="community-page-header">
        <div>
          <h2>Analytics</h2>
          <p>How your work is doing. Your own views, likes and comments aren't counted.</p>
        </div>
      </div>

      <div className="analytics-filters" role="group" aria-label="Date range">
        {RANGES.map(r => (
          <button
            key={r}
            className={`explore-chip ${r === days ? 'active' : ''}`}
            aria-pressed={r === days}
            onClick={() => setParams(r === 30 ? {} : { days: String(r) })}
          >
            Last {r} days
          </button>
        ))}
      </div>

      {error && <p className="form-error">{error}</p>}
      {!data && !error && <div className="explore-loading"><div className="loading-spinner" /></div>}

      {data && (
        <div className={`analytics-body ${loading ? 'refetching' : ''}`}>
          <div className="stat-grid">
            <StatTile label="Views" value={data.current.views} previous={data.previous.views} days={data.days} />
            <StatTile label="Likes" value={data.current.likes} previous={data.previous.likes} days={data.days} />
            <StatTile label="Comments" value={data.current.comments} previous={data.previous.comments} days={data.days} />
            <StatTile label="New followers" value={data.current.followers} previous={data.previous.followers} days={data.days} />
          </div>
          <p className="analytics-alltime">
            All time: {data.allTime.views.toLocaleString()} views · {data.allTime.likes.toLocaleString()} likes ·{' '}
            {data.allTime.followers.toLocaleString()} followers · {data.allTime.artworks} artworks
            {data.current.downloads > 0 && ` · ${data.current.downloads} marketplace downloads this period`}
          </p>

          <div className="chart-grid">
            {(['views', 'likes', 'followers'] as const).map(key => {
              const title = key === 'followers' ? 'New followers' : key[0].toUpperCase() + key.slice(1);
              return (
                <section key={key} className="chart-card">
                  <h3>{title} per day</h3>
                  <LineChart points={series(key)} label={title} />
                  <DataTable caption={`${title} per day`} columns={['Date (UTC)', title]} rows={tableRows(key)} />
                </section>
              );
            })}

            <section className="chart-card">
              <h3>Where views come from</h3>
              {data.sources.length === 0 ? (
                <p className="empty-note small">No views in this period yet.</p>
              ) : (
                <>
                  <BarList
                    label="Views by traffic source"
                    rows={data.sources.map(s => ({ label: SOURCE_LABELS[s.source] ?? s.source, value: s.views }))}
                  />
                  <DataTable
                    caption="Views by traffic source"
                    columns={['Source', 'Views']}
                    rows={data.sources.map(s => [SOURCE_LABELS[s.source] ?? s.source, s.views])}
                  />
                </>
              )}
            </section>
          </div>

          <section className="chart-card">
            <h3>Top artworks this period</h3>
            {data.topArtworks.length === 0 ? (
              <p className="empty-note small">Upload an artwork to see how it performs.</p>
            ) : (
              <table className="analytics-top">
                <thead>
                  <tr><th scope="col">Artwork</th><th scope="col">Views</th><th scope="col">Likes</th><th scope="col">Comments</th></tr>
                </thead>
                <tbody>
                  {data.topArtworks.map(a => (
                    <tr key={a.id}>
                      <td><button onClick={() => onOpenArtwork(a.id)}>{a.title || 'Untitled'}</button></td>
                      <td>{a.views.toLocaleString()}</td>
                      <td>{a.likes.toLocaleString()}</td>
                      <td>{a.comments.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
