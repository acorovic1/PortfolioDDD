import { useCallback, useEffect, useState } from 'react';
import { resizedUrl } from '@/frontend/utils/images';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/frontend/hooks/useAuth';
import { apiFetch, queryString, assetUrl } from '@/frontend/utils/api';
import { safeUrl, validateLink } from '@/frontend/utils/safeUrl';
import { CloseIcon, BriefcaseIcon, SearchIcon } from '@/frontend/svg/Icons';
import {
  EMPLOYMENT_LABELS, WORKPLACE_LABELS,
  type Job, type EmploymentType, type Workplace,
} from '@/types/Community';
import '@/frontend/css/Community.css';
import '@/frontend/css/Jobs.css';

function postedAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

type JobForm = {
  title: string; company: string; location: string; workplace: Workplace; employmentType: EmploymentType;
  salary: string; description: string; skills: string; applyUrl: string;
};

const EMPTY_FORM: JobForm = {
  title: '', company: '', location: '', workplace: 'remote', employmentType: 'full_time',
  salary: '', description: '', skills: '', applyUrl: '',
};

function PostJobDialog({ onClose, onPosted }: { onClose: () => void; onPosted: (job: Job) => void }) {
  const { token } = useAuth();
  const [form, setForm] = useState<JobForm>(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof JobForm>(key: K, value: JobForm[K]) => setForm(prev => ({ ...prev, [key]: value }));
  const linkError = validateLink(form.applyUrl);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (linkError) return;
    setSaving(true);
    setError('');
    try {
      const job = await apiFetch<Job>('/api/jobs', {
        method: 'POST',
        token,
        body: {
          ...form,
          skills: form.skills.split(',').map(s => s.trim()).filter(Boolean),
          applyUrl: form.applyUrl.trim(),
          salary: form.salary.trim() || undefined,
          location: form.location.trim() || undefined,
        },
      });
      onPosted(job);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Post a job">
        <header>
          <h3>Post a job</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </header>
        <form onSubmit={submit}>
          <div className="modal-body">
            <div className="form-row">
              <label className="form-field">Job title<input required maxLength={160} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Senior Character Artist" /></label>
              <label className="form-field">Company<input required maxLength={120} value={form.company} onChange={(e) => set('company', e.target.value)} /></label>
            </div>
            <div className="form-row">
              <label className="form-field">Type
                <select value={form.employmentType} onChange={(e) => set('employmentType', e.target.value as EmploymentType)}>
                  {Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="form-field">Workplace
                <select value={form.workplace} onChange={(e) => set('workplace', e.target.value as Workplace)}>
                  {Object.entries(WORKPLACE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="form-field">Location<input maxLength={120} value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="City, country" /></label>
              <label className="form-field">Pay (optional)<input maxLength={80} value={form.salary} onChange={(e) => set('salary', e.target.value)} placeholder="$70-90k / €400/day" /></label>
            </div>
            <label className="form-field">Description
              <textarea required maxLength={10000} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="The role, the team, what you're looking for…" />
            </label>
            <label className="form-field">Skills (comma separated)<input value={form.skills} onChange={(e) => set('skills', e.target.value)} placeholder="ZBrush, Substance Painter, Unreal" /></label>
            <label className="form-field">External application link (optional)
              <input value={form.applyUrl} onChange={(e) => set('applyUrl', e.target.value)} placeholder="Leave empty to receive applications as messages" aria-invalid={!!linkError} />
              {linkError && <small className="form-error">{linkError}</small>}
            </label>
            {error && <p className="form-error">{error}</p>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving || !!linkError}>{saving ? 'Posting…' : 'Post job'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

type Application = { username: string; avatarUrl: string | null; title: string | null; message: string; createdAt: string };

function JobDetail({ job, onChanged, onOpenUser, onRequireLogin }: {
  job: Job;
  onChanged: () => void;
  onOpenUser: (username: string) => void;
  onRequireLogin: () => void;
}) {
  const { user, token } = useAuth();
  const isPoster = user?.username === job.poster.username;
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [applications, setApplications] = useState<Application[] | null>(null);
  const externalLink = safeUrl(job.applyUrl);

  useEffect(() => {
    if (!isPoster) return;
    apiFetch<{ applications: Application[] }>(`/api/jobs/${job.id}/applications`, { token })
      .then(data => setApplications(data.applications))
      .catch(() => setApplications([]));
  }, [isPoster, job.id, token]);

  const apply = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch(`/api/jobs/${job.id}/apply`, { method: 'POST', token, body: { message } });
      setStatus('Application sent - the conversation continues in your messages.');
      setApplying(false);
      onChanged();
    } catch (err) {
      setStatus((err as Error).message);
    }
  };

  const update = async (body: Record<string, unknown>) => {
    await apiFetch(`/api/jobs/${job.id}`, { method: 'PUT', token, body });
    onChanged();
  };

  const remove = async () => {
    if (!confirm('Delete this job posting?')) return;
    await apiFetch(`/api/jobs/${job.id}`, { method: 'DELETE', token });
    onChanged();
  };

  return (
    <article className="job-detail">
      <header>
        <h3>{job.title}</h3>
        <p className="job-company">{job.company}{job.location && ` · ${job.location}`}</p>
        <div className="job-tags">
          <span>{EMPLOYMENT_LABELS[job.employmentType]}</span>
          <span>{WORKPLACE_LABELS[job.workplace]}</span>
          {job.salary && <span>{job.salary}</span>}
          {!job.isOpen && <span className="closed">Closed</span>}
        </div>
      </header>

      <p className="job-description">{job.description}</p>

      {job.skills.length > 0 && (
        <div className="job-skills">{job.skills.map(s => <span key={s} className="info-tag">{s}</span>)}</div>
      )}

      <button className="job-poster" onClick={() => onOpenUser(job.poster.username)}>
        Posted by @{job.poster.username} · {postedAgo(job.createdAt)}
      </button>

      {isPoster ? (
        <div className="job-owner">
          <div className="job-owner-actions">
            <button className="btn small" onClick={() => update({ isOpen: !job.isOpen })}>{job.isOpen ? 'Close posting' : 'Reopen'}</button>
            <button className="btn small danger" onClick={remove}>Delete</button>
          </div>
          <h4>Applications ({applications?.length ?? '…'})</h4>
          {applications?.length === 0 && <p className="empty-note small">No applications yet.</p>}
          <ul className="job-applications">
            {applications?.map(a => (
              <li key={a.username}>
                <button onClick={() => onOpenUser(a.username)}>
                  {a.avatarUrl ? <img src={resizedUrl(assetUrl(a.avatarUrl)!, 96)} alt="" /> : <span className="artwork-card-avatar">{a.username.charAt(0).toUpperCase()}</span>}
                  <strong>@{a.username}</strong>{a.title && <small>{a.title}</small>}
                </button>
                <p>{a.message}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : externalLink ? (
        <a className="btn primary" href={externalLink} target="_blank" rel="noopener noreferrer nofollow">Apply on company site</a>
      ) : job.hasApplied ? (
        <p className="job-applied">✓ You applied to this job</p>
      ) : applying ? (
        <form className="job-apply" onSubmit={apply}>
          <label className="form-field">
            Message to @{job.poster.username}
            <textarea required maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Why you're a fit - your portfolio is linked automatically." />
          </label>
          <div className="job-owner-actions">
            <button type="button" className="btn" onClick={() => setApplying(false)}>Cancel</button>
            <button type="submit" className="btn primary" disabled={!message.trim()}>Send application</button>
          </div>
        </form>
      ) : (
        <button className="btn primary" onClick={() => (user ? setApplying(true) : onRequireLogin())}>Apply</button>
      )}
      {status && <p className="job-status">{status}</p>}
    </article>
  );
}

type JobsPageProps = {
  onOpenUser: (username: string) => void;
  onRequireLogin: () => void;
};

export default function JobsPage({ onOpenUser, onRequireLogin }: JobsPageProps) {
  const { user, token } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const type = params.get('type') ?? '';
  const workplace = params.get('workplace') ?? '';
  const mine = params.get('mine') === 'true';
  const selectedId = params.get('job');

  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [selected, setSelected] = useState<Job | null>(null);
  const [posting, setPosting] = useState(false);
  const [search, setSearch] = useState(q);
  const [refresh, setRefresh] = useState(0);

  const setParam = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }, [params, setParams]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ jobs: Job[] }>(`/api/jobs${queryString({ q, type, workplace, mine: mine || undefined, limit: 50 })}`, { token })
      .then(data => { if (!cancelled) setJobs(data.jobs); })
      .catch(err => console.error('Failed to load jobs:', err));
    return () => { cancelled = true; };
  }, [q, type, workplace, mine, token, refresh]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    apiFetch<Job>(`/api/jobs/${selectedId}`, { token })
      .then(job => { if (!cancelled) setSelected(job); })
      .catch(() => { if (!cancelled) setSelected(null); });
    return () => { cancelled = true; };
  }, [selectedId, token, refresh]);

  const shownJob = selectedId && selected?.id === selectedId ? selected : null;

  return (
    <div className="community-page jobs-page">
      <div className="community-page-header">
        <div>
          <h2>Jobs</h2>
          <p>Studios and clients hiring 3D artists.</p>
        </div>
        <button className="btn primary" onClick={() => (user ? setPosting(true) : onRequireLogin())}>
          <BriefcaseIcon /> Post a job
        </button>
      </div>

      <div className="jobs-filters">
        <form className="explore-search" onSubmit={(e) => { e.preventDefault(); setParam('q', search.trim()); }}>
          <SearchIcon />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Role, company or keyword" aria-label="Search jobs" />
        </form>
        <select value={type} onChange={(e) => setParam('type', e.target.value)} aria-label="Job type">
          <option value="">Any type</option>
          {Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={workplace} onChange={(e) => setParam('workplace', e.target.value)} aria-label="Workplace">
          <option value="">Any workplace</option>
          {Object.entries(WORKPLACE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {user && (
          <label className="form-check">
            <input type="checkbox" checked={mine} onChange={(e) => setParam('mine', e.target.checked ? 'true' : '')} />
            My postings
          </label>
        )}
      </div>

      <div className={`jobs-layout ${shownJob ? 'has-detail' : ''}`}>
        <ul className="jobs-list">
          {jobs === null && <div className="explore-loading"><div className="loading-spinner" /></div>}
          {jobs?.length === 0 && <p className="empty-note">{mine ? "You haven't posted any jobs." : 'No jobs match these filters.'}</p>}
          {jobs?.map(job => (
            <li key={job.id}>
              <button className={`job-card ${job.id === selectedId ? 'active' : ''}`} onClick={() => setParam('job', job.id)}>
                <strong>{job.title}</strong>
                <span className="job-company">{job.company}{job.location && ` · ${job.location}`}</span>
                <span className="job-tags">
                  <span>{EMPLOYMENT_LABELS[job.employmentType]}</span>
                  <span>{WORKPLACE_LABELS[job.workplace]}</span>
                  {!job.isOpen && <span className="closed">Closed</span>}
                  {job.applicationCount != null && <span>{job.applicationCount} applicants</span>}
                </span>
                <time>{postedAgo(job.createdAt)}</time>
              </button>
            </li>
          ))}
        </ul>

        {shownJob && (
          <div className="jobs-detail-pane">
            <button className="jobs-detail-close" onClick={() => setParam('job', '')} aria-label="Close job"><CloseIcon /></button>
            <JobDetail
              key={shownJob.id}
              job={shownJob}
              onChanged={() => setRefresh(r => r + 1)}
              onOpenUser={onOpenUser}
              onRequireLogin={onRequireLogin}
            />
          </div>
        )}
      </div>

      {posting && (
        <PostJobDialog
          onClose={() => setPosting(false)}
          onPosted={(job) => {
            setPosting(false);
            setRefresh(r => r + 1);
            setParam('job', job.id);
          }}
        />
      )}
    </div>
  );
}
