import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/frontend/hooks/useAuth';
import { apiFetch } from '@/frontend/utils/api';
import ArtworkCard from '@/frontend/components/explore/ArtworkCard';
import { CloseIcon, TrophyIcon, HeartIcon } from '@/frontend/svg/Icons';
import type { Challenge, ChallengeEntry } from '@/types/Community';
import type { RemoteArtwork } from '@/types/PortfolioPiece';
import '@/frontend/css/Explore.css';
import '@/frontend/css/Community.css';
import '@/frontend/css/Challenges.css';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`;
  const hours = Math.max(1, Math.floor(ms / 3_600_000));
  return `${hours} hour${hours === 1 ? '' : 's'} left`;
}

const STATUS_LABEL = { upcoming: 'Upcoming', active: 'Open', ended: 'Ended' } as const;

function CreateChallengeDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Challenge) => void }) {
  const { token } = useAuth();
  const today = new Date();
  const toInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const [form, setForm] = useState({
    title: '', brief: '', rules: '', prize: '',
    startsAt: toInput(today), endsAt: toInput(new Date(today.getTime() + 14 * 86_400_000)),
  });
  const [error, setError] = useState('');
  const set = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      onCreated(await apiFetch<Challenge>('/api/challenges', {
        method: 'POST',
        token,
        body: {
          title: form.title, brief: form.brief,
          rules: form.rules.trim() || undefined, prize: form.prize.trim() || undefined,
          startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString(),
        },
      }));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="New challenge">
        <header>
          <h3>New challenge</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </header>
        <form onSubmit={submit}>
          <div className="modal-body">
            <label className="form-field">Title<input required maxLength={160} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Sci-fi Props Week" /></label>
            <label className="form-field">Brief<textarea required maxLength={5000} value={form.brief} onChange={(e) => set('brief', e.target.value)} placeholder="What to make" /></label>
            <label className="form-field">Rules (optional)<textarea maxLength={5000} value={form.rules} onChange={(e) => set('rules', e.target.value)} placeholder="Poly budget, texture size, deadlines…" /></label>
            <div className="form-row">
              <label className="form-field">Prize (optional)<input maxLength={200} value={form.prize} onChange={(e) => set('prize', e.target.value)} /></label>
              <label className="form-field">Starts<input type="datetime-local" required value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} /></label>
              <label className="form-field">Ends<input type="datetime-local" required value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} /></label>
            </div>
            {error && <p className="form-error">{error}</p>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary">Create</button>
          </div>
        </form>
      </div>
    </div>
  );
}

type DetailProps = {
  challengeId: string;
  onBack: () => void;
  onOpenArtwork: (username: string, artworkId: string) => void;
  onOpenUser: (username: string) => void;
  onRequireLogin: () => void;
};

function ChallengeDetail({ challengeId, onBack, onOpenArtwork, onOpenUser, onRequireLogin }: DetailProps) {
  const { user, token } = useAuth();
  const [data, setData] = useState<{ challenge: Challenge; entries: ChallengeEntry[]; myEntry: string | null } | null>(null);
  const [myArtworks, setMyArtworks] = useState<RemoteArtwork[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    apiFetch<{ challenge: Challenge; entries: ChallengeEntry[]; myEntry: string | null }>(`/api/challenges/${challengeId}`, { token })
      .then(setData)
      .catch(err => setError((err as Error).message));
  }, [challengeId, token]);

  useEffect(() => {
    load();
  }, [load]);

  const pickEntry = async () => {
    if (!user) return onRequireLogin();
    const own = await apiFetch<RemoteArtwork[]>('/api/portfolio', { token });
    // Only published, public artworks can be entered.
    setMyArtworks(own.filter(a => a.modelUrl && a.visibility === 'public' && a.publishedAt && new Date(a.publishedAt) <= new Date()));
  };

  const act = async (request: Promise<unknown>) => {
    setError('');
    try {
      await request;
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!data) return error ? <p className="form-error">{error}</p> : <div className="explore-loading"><div className="loading-spinner" /></div>;
  const { challenge, entries, myEntry } = data;
  const active = challenge.status === 'active';

  return (
    <div className="challenge-detail">
      <button className="challenge-back" onClick={onBack}>← All challenges</button>
      <header className="challenge-hero">
        <span className={`challenge-status ${challenge.status}`}>{STATUS_LABEL[challenge.status]}</span>
        <h2>{challenge.title}</h2>
        <p className="challenge-dates">
          {formatDate(challenge.startsAt)} – {formatDate(challenge.endsAt)}
          {active && ` · ${timeLeft(challenge.endsAt)}`}
          {challenge.prize && <> · <TrophyIcon /> {challenge.prize}</>}
        </p>
        <p className="challenge-brief">{challenge.brief}</p>
        {challenge.rules && <details><summary>Rules</summary><p className="challenge-brief">{challenge.rules}</p></details>}
        {active && (
          myEntry ? (
            <button className="btn" onClick={() => act(apiFetch(`/api/challenges/${challenge.id}/entries/mine`, { method: 'DELETE', token }))}>Withdraw my entry</button>
          ) : (
            <button className="btn primary" onClick={pickEntry}>Submit an entry</button>
          )
        )}
        {error && <p className="form-error">{error}</p>}
      </header>

      {myArtworks && (
        <div className="modal-overlay" onClick={() => setMyArtworks(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Choose your entry">
            <header>
              <h3>Choose your entry</h3>
              <button className="modal-close" onClick={() => setMyArtworks(null)} aria-label="Close"><CloseIcon /></button>
            </header>
            <div className="modal-body">
              {myArtworks.length === 0 && <p>Publish a public artwork first - drafts, private and unlisted work can't be entered.</p>}
              {myArtworks.map(a => (
                <button
                  key={a.id}
                  className="challenge-pick"
                  onClick={() => {
                    setMyArtworks(null);
                    act(apiFetch(`/api/challenges/${challenge.id}/entries`, { method: 'POST', token, body: { artworkId: a.id } }));
                  }}
                >
                  {a.title || 'Untitled'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <h3 className="challenge-entries-title">
        {challenge.status === 'ended' ? 'Results' : 'Entries'} ({entries.length})
      </h3>
      {entries.length === 0 && <p className="empty-note">No entries yet{active ? ' - be the first!' : '.'}</p>}
      <div className="explore-grid">
        {entries.map(entry => {
          const own = entry.username === user?.username;
          return (
            <div key={entry.artworkId} className="challenge-entry">
              <ArtworkCard
                artwork={{ ...entry, id: entry.artworkId }}
                showMature={!!user?.showMature}
                onOpen={() => onOpenArtwork(entry.username, entry.artworkId)}
                onOpenAuthor={() => onOpenUser(entry.username)}
                badge={challenge.status === 'ended' && entry.rank <= 3
                  ? <span className={`content-badge rank rank-${entry.rank}`}>#{entry.rank}</span>
                  : undefined}
              />
              <div className="challenge-vote">
                <span>{entry.votes} vote{entry.votes === 1 ? '' : 's'}</span>
                {active && !own && (
                  <button
                    className={`btn small ${entry.votedByViewer ? 'primary' : ''}`}
                    onClick={() => {
                      if (!user) return onRequireLogin();
                      act(apiFetch(`/api/challenges/${challenge.id}/entries/${entry.artworkId}/vote`, {
                        method: entry.votedByViewer ? 'DELETE' : 'POST',
                        token,
                      }));
                    }}
                  >
                    <HeartIcon width={13} height={13} /> {entry.votedByViewer ? 'Voted' : 'Vote'}
                  </button>
                )}
                {own && <span className="challenge-own">Your entry</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ChallengesPageProps = {
  onOpenArtwork: (username: string, artworkId: string) => void;
  onOpenUser: (username: string) => void;
  onRequireLogin: () => void;
};

// Themed, time-boxed community contests: enter one artwork, vote on others.
export default function ChallengesPage({ onOpenArtwork, onOpenUser, onRequireLogin }: ChallengesPageProps) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const selected = params.get('id');
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    apiFetch<{ challenges: Challenge[] }>('/api/challenges')
      .then(data => setChallenges(data.challenges))
      .catch(err => console.error('Failed to load challenges:', err));
  }, [refresh]);

  if (selected) {
    return (
      <div className="community-page">
        <ChallengeDetail
          key={selected}
          challengeId={selected}
          onBack={() => setParams({})}
          onOpenArtwork={onOpenArtwork}
          onOpenUser={onOpenUser}
          onRequireLogin={onRequireLogin}
        />
      </div>
    );
  }

  return (
    <div className="community-page">
      <div className="community-page-header">
        <div>
          <h2>Challenges</h2>
          <p>Themed contests - enter one piece, vote for your favourites.</p>
        </div>
        {user?.role === 'admin' && (
          <button className="btn primary" onClick={() => setCreating(true)}><TrophyIcon /> New challenge</button>
        )}
      </div>

      {challenges === null && <div className="explore-loading"><div className="loading-spinner" /></div>}
      {challenges?.length === 0 && <p className="empty-note">No challenges yet - check back soon.</p>}

      <div className="challenge-list">
        {challenges?.map(c => (
          <button key={c.id} className={`challenge-card ${c.status}`} onClick={() => setParams({ id: c.id })}>
            <span className={`challenge-status ${c.status}`}>{STATUS_LABEL[c.status]}</span>
            <strong>{c.title}</strong>
            <p>{c.brief}</p>
            <span className="challenge-meta">
              {c.status === 'active' ? timeLeft(c.endsAt) : c.status === 'upcoming' ? `Starts ${formatDate(c.startsAt)}` : `Ended ${formatDate(c.endsAt)}`}
              {' · '}{c.entryCount} entr{c.entryCount === 1 ? 'y' : 'ies'}
              {c.prize && <> · <TrophyIcon /> {c.prize}</>}
            </span>
          </button>
        ))}
      </div>

      {creating && (
        <CreateChallengeDialog
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false);
            setRefresh(r => r + 1);
            setParams({ id: c.id });
          }}
        />
      )}
    </div>
  );
}
