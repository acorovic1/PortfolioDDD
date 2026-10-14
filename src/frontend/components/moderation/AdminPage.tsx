import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/frontend/hooks/useAuth';
import { apiFetch, profilePath } from '@/frontend/utils/api';
import ConfirmDialog from '@/frontend/components/ConfirmDialog';
import '@/frontend/css/Community.css';
import '@/frontend/css/Admin.css';

type Report = {
  id: string;
  targetType: 'artwork' | 'comment' | 'user' | 'message';
  targetId: string;
  targetSummary: string | null;
  targetUsername: string | null;
  targetUserSuspended: boolean;
  targetExists: boolean;
  reason: string;
  details: string | null;
  reporterUsername: string | null;
  openReportsOnTarget: number;
  status: string;
  resolution: string | null;
  resolutionNote: string | null;
  resolvedByUsername: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

type AdminUser = {
  id: string;
  username: string;
  email: string;
  role: string;
  suspendedAt: string | null;
  suspensionReason: string | null;
  createdAt: string;
  artworks: number;
  reportsAgainst: number;
};

type Overview = { openReports: number; suspendedUsers: number; users: number; artworks: number };
type Tab = 'open' | 'closed' | 'users';

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  hate: 'Hate',
  unlabeled_mature: 'Unlabelled 18+',
  violence: 'Violence',
  stolen_work: 'Stolen work',
  unlabeled_ai: 'Unlabelled AI',
  impersonation: 'Impersonation',
  other: 'Other',
};

const RESOLUTION_LABELS: Record<string, string> = {
  dismiss: 'Dismissed',
  remove_content: 'Content removed',
  suspend_user: 'User suspended',
  remove_and_suspend: 'Removed + suspended',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function ReportCard({ report, onResolved }: { report: Report; onResolved: () => void }) {
  const { token } = useAuth();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const resolve = async (action: string) => {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/admin/reports/${report.id}/resolve`, {
        method: 'POST',
        token,
        body: { action, note: note.trim() || undefined },
      });
      onResolved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const linksToArtwork = report.targetType === 'artwork' && report.targetUsername !== null && report.targetExists;
  const targetLink = linksToArtwork
    ? `${profilePath(report.targetUsername!)}?artwork=${report.targetId}`
    : report.targetUsername ? profilePath(report.targetUsername) : null;
  const isOpen = report.status === 'open';

  return (
    <article className={`report-card ${isOpen ? '' : 'closed'}`}>
      <header>
        <span className={`report-type ${report.targetType}`}>{report.targetType}</span>
        <span className="report-reason">{REASON_LABELS[report.reason] ?? report.reason}</span>
        {report.openReportsOnTarget > 1 && isOpen && (
          <span className="report-count" title="Open reports on this target">×{report.openReportsOnTarget}</span>
        )}
        <time>{formatDate(report.createdAt)}</time>
      </header>

      <blockquote className={report.targetExists ? '' : 'removed'}>
        {report.targetSummary ?? '(no preview)'}
        {!report.targetExists && <em> - removed</em>}
      </blockquote>

      <dl>
        <div><dt>By</dt><dd>{report.targetUsername ? `@${report.targetUsername}` : '—'}{report.targetUserSuspended && ' (suspended)'}</dd></div>
        <div><dt>Reported by</dt><dd>{report.reporterUsername ? `@${report.reporterUsername}` : '(deleted user)'}</dd></div>
        {report.details && <div><dt>Details</dt><dd>{report.details}</dd></div>}
        {!isOpen && (
          <div>
            <dt>Outcome</dt>
            <dd>
              {RESOLUTION_LABELS[report.resolution ?? ''] ?? report.status}
              {report.resolvedByUsername && ` by @${report.resolvedByUsername}`}
              {report.resolvedAt && `, ${formatDate(report.resolvedAt)}`}
              {report.resolutionNote && ` - “${report.resolutionNote}”`}
            </dd>
          </div>
        )}
      </dl>

      {targetLink && <Link className="report-link" to={targetLink}>View {linksToArtwork ? 'artwork' : 'profile'} →</Link>}

      {isOpen && (
        <div className="report-actions">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (shown as the suspension reason)"
            aria-label="Moderator note"
          />
          <button className="btn small" disabled={busy} onClick={() => resolve('dismiss')}>Dismiss</button>
          {report.targetType !== 'user' && report.targetExists && (
            <button className="btn small danger" disabled={busy} onClick={() => resolve('remove_content')}>Remove {report.targetType}</button>
          )}
          {!report.targetUserSuspended && report.targetUsername && (
            <button className="btn small danger" disabled={busy} onClick={() => resolve('suspend_user')}>Suspend user</button>
          )}
          {report.targetType !== 'user' && report.targetExists && !report.targetUserSuspended && (
            <button className="btn small danger" disabled={busy} onClick={() => resolve('remove_and_suspend')}>Remove + suspend</button>
          )}
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </article>
  );
}

function UsersTab() {
  const { token, user: me } = useAuth();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);

  const load = useCallback((q: string) => {
    apiFetch<{ users: AdminUser[] }>(`/api/admin/users?q=${encodeURIComponent(q)}`, { token })
      .then(data => setUsers(data.users))
      .catch(err => console.error('Failed to load users:', err));
  }, [token]);

  useEffect(() => {
    load('');
  }, [load]);

  // What the confirmation card is asking about.
  const [pending, setPending] = useState<
    { kind: 'suspend'; user: AdminUser } | { kind: 'role'; user: AdminUser; role: 'user' | 'admin' } | null
  >(null);
  const [reason, setReason] = useState('');

  const suspend = async (target: AdminUser, suspended: boolean, suspensionReason?: string) => {
    await apiFetch(`/api/admin/users/${target.id}/suspend`, { method: 'POST', token, body: { suspended, reason: suspensionReason } });
    load(query);
  };

  // Suspending asks for a reason (shown to them) first; lifting it doesn't.
  const askSuspend = (target: AdminUser) => {
    setReason('Community guidelines violation');
    setPending({ kind: 'suspend', user: target });
  };

  const setRole = async (target: AdminUser, role: 'user' | 'admin') => {
    await apiFetch(`/api/admin/users/${target.id}/role`, { method: 'POST', token, body: { role } });
    load(query);
  };

  return (
    <div className="admin-users">
      <form onSubmit={(e) => { e.preventDefault(); load(query); }} className="admin-search">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by username or email" />
        <button className="btn" type="submit">Search</button>
      </form>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>User</th><th>Email</th><th>Joined</th><th>Artworks</th><th>Reports</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td><Link to={profilePath(u.username)}>@{u.username}</Link>{u.role === 'admin' && <span className="content-badge noai">admin</span>}</td>
                <td>{u.email}</td>
                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td>{u.artworks}</td>
                <td>{u.reportsAgainst}</td>
                <td>{u.suspendedAt ? <span title={u.suspensionReason ?? ''} className="admin-suspended">Suspended</span> : 'Active'}</td>
                <td className="admin-row-actions">
                  {u.id !== me?.id && (
                    <>
                      <button className="btn small" onClick={() => (u.suspendedAt ? void suspend(u, false) : askSuspend(u))}>{u.suspendedAt ? 'Unsuspend' : 'Suspend'}</button>
                      <button className="btn small" onClick={() => setPending({ kind: 'role', user: u, role: u.role === 'admin' ? 'user' : 'admin' })}>
                        {u.role === 'admin' ? 'Remove admin' : 'Make admin'}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pending?.kind === 'suspend' && (
        <ConfirmDialog
          title={`Suspend @${pending.user.username}?`}
          confirmLabel="Suspend"
          busyLabel="Suspending..."
          danger
          initialFocus="field"
          confirmDisabled={!reason.trim()}
          onConfirm={() => suspend(pending.user, true, reason.trim())}
          onClose={() => setPending(null)}
        >
          <p className="confirm-warning">They can't sign in or post while suspended, and their work is hidden from everyone.</p>
          <label className="confirm-field">
            Reason (shown to them)
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} />
          </label>
        </ConfirmDialog>
      )}
      {pending?.kind === 'role' && (
        <ConfirmDialog
          title={pending.role === 'admin' ? `Make @${pending.user.username} an admin?` : `Remove admin rights from @${pending.user.username}?`}
          confirmLabel={pending.role === 'admin' ? 'Make admin' : 'Remove admin'}
          danger={pending.role === 'user'}
          onConfirm={() => setRole(pending.user, pending.role)}
          onClose={() => setPending(null)}
        >
          <p className="confirm-warning">
            {pending.role === 'admin'
              ? "Admins can handle reports, suspend accounts and change other users' roles."
              : 'They lose access to the moderation dashboard right away.'}
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

// Moderation dashboard: the report queue (open/handled) and user management.
export default function AdminPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>('open');
  const [reports, setReports] = useState<Report[] | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    apiFetch<Overview>('/api/admin/overview', { token }).then(setOverview).catch(() => {});
  }, [token, refreshKey]);

  useEffect(() => {
    if (tab === 'users') return;
    let cancelled = false;
    apiFetch<{ reports: Report[] }>(`/api/admin/reports?status=${tab}&limit=50`, { token })
      .then(data => { if (!cancelled) setReports(data.reports); })
      .catch(err => console.error('Failed to load reports:', err));
    return () => { cancelled = true; };
  }, [tab, token, refreshKey]);

  return (
    <div className="community-page admin-page">
      <div className="community-page-header">
        <div>
          <h2>Moderation</h2>
          <p>Review reports and manage accounts.</p>
        </div>
        {overview && (
          <div className="admin-overview">
            <div><strong>{overview.openReports}</strong><span>Open reports</span></div>
            <div><strong>{overview.suspendedUsers}</strong><span>Suspended</span></div>
            <div><strong>{overview.users}</strong><span>Users</span></div>
            <div><strong>{overview.artworks}</strong><span>Artworks</span></div>
          </div>
        )}
      </div>

      <nav className="explore-tabs">
        {([['open', 'Open reports'], ['closed', 'Handled'], ['users', 'Users']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} className={`explore-tab ${tab === id ? 'active' : ''}`} onClick={() => { setReports(null); setTab(id); }}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'users' ? (
        <UsersTab />
      ) : reports === null ? (
        <div className="explore-loading"><div className="loading-spinner" /></div>
      ) : reports.length === 0 ? (
        <p className="empty-note">{tab === 'open' ? 'All clear - no open reports.' : 'Nothing handled yet.'}</p>
      ) : (
        <div className="report-list">
          {reports.map(r => (
            <ReportCard key={r.id} report={r} onResolved={() => setRefreshKey(k => k + 1)} />
          ))}
        </div>
      )}
    </div>
  );
}
