import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/frontend/hooks/useAuth';
import { apiFetch, assetUrl } from '@/frontend/utils/api';
import { CloseIcon } from '@/frontend/svg/Icons';
import '@/frontend/css/Community.css';

export type ProfileSummary = {
  username: string;
  noAiTraining: boolean;
  stats: { followers: number; following: number; artworks: number; views: number; likes: number };
  viewer: { isSelf: boolean; isFollowing: boolean };
};

type FollowUser = { username: string; name: string; avatarUrl: string | null; title: string | null };

type ProfileSocialBarProps = {
  username: string;
  onOpenUser: (username: string) => void;
  onRequireLogin: () => void;
  // Extra actions for other people's profiles (message, hire, report...).
  actions?: (summary: ProfileSummary) => ReactNode;
};

function compact(n: number): string {
  return Intl.NumberFormat(undefined, { notation: 'compact' }).format(n);
}

// Follower/following/views numbers, the follow button, and the follower
// lists, for a profile sidebar (your own or someone else's).
export default function ProfileSocialBar({ username, onOpenUser, onRequireLogin, actions }: ProfileSocialBarProps) {
  const { user, token } = useAuth();
  const [summary, setSummary] = useState<ProfileSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<{ kind: 'followers' | 'following'; users: FollowUser[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ProfileSummary>(`/api/users/${encodeURIComponent(username)}/summary`, { token })
      .then(data => { if (!cancelled) setSummary(data); })
      .catch(err => console.error('Failed to load profile summary:', err));
    return () => { cancelled = true; };
  }, [username, token]);

  const toggleFollow = async () => {
    if (!user || !token) {
      onRequireLogin();
      return;
    }
    if (!summary) return;
    setBusy(true);
    try {
      const result = await apiFetch<{ isFollowing: boolean; followers: number; following: number }>(
        `/api/users/${encodeURIComponent(username)}/follow`,
        { method: summary.viewer.isFollowing ? 'DELETE' : 'POST', token }
      );
      setSummary(prev => prev && {
        ...prev,
        stats: { ...prev.stats, followers: result.followers },
        viewer: { ...prev.viewer, isFollowing: result.isFollowing },
      });
    } catch (err) {
      console.error('Failed to update follow:', err);
    } finally {
      setBusy(false);
    }
  };

  const openList = async (kind: 'followers' | 'following') => {
    const { users } = await apiFetch<{ users: FollowUser[] }>(
      `/api/users/${encodeURIComponent(username)}/${kind}?limit=50`
    );
    setList({ kind, users });
  };

  if (!summary) return <div className="profile-social placeholder" />;

  return (
    <div className="profile-social">
      <div className="profile-stats">
        <button onClick={() => openList('followers')}>
          <strong>{compact(summary.stats.followers)}</strong><span>Followers</span>
        </button>
        <button onClick={() => openList('following')}>
          <strong>{compact(summary.stats.following)}</strong><span>Following</span>
        </button>
        <div>
          <strong>{compact(summary.stats.views)}</strong><span>Views</span>
        </div>
        <div>
          <strong>{compact(summary.stats.likes)}</strong><span>Likes</span>
        </div>
      </div>

      {summary.noAiTraining && (
        <span className="content-badge noai" title="This artist doesn't consent to their work being used to train AI">
          NoAI
        </span>
      )}

      {!summary.viewer.isSelf && (
        <div className="profile-actions">
          <button
            className={`profile-follow-btn ${summary.viewer.isFollowing ? 'following' : ''}`}
            onClick={toggleFollow}
            disabled={busy}
          >
            {summary.viewer.isFollowing ? 'Following' : 'Follow'}
          </button>
          {actions?.(summary)}
        </div>
      )}

      {list && (
        <div className="modal-overlay" onClick={() => setList(null)}>
          <div className="modal-card follow-list" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={list.kind}>
            <header>
              <h3>{list.kind === 'followers' ? 'Followers' : 'Following'}</h3>
              <button className="modal-close" onClick={() => setList(null)} aria-label="Close"><CloseIcon /></button>
            </header>
            {list.users.length === 0 && <p className="follow-list-empty">Nobody yet.</p>}
            <ul>
              {list.users.map(u => (
                <li key={u.username}>
                  <button onClick={() => { setList(null); onOpenUser(u.username); }}>
                    {u.avatarUrl
                      ? <img src={assetUrl(u.avatarUrl)!} alt="" />
                      : <span className="artwork-card-avatar">{u.username.charAt(0).toUpperCase()}</span>}
                    <span>
                      <strong>{u.username}</strong>
                      {u.title && <small>{u.title}</small>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
