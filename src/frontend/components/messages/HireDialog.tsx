import { useState } from 'react';
import { useAuth } from '@/frontend/hooks/useAuth';
import { apiFetch } from '@/frontend/utils/api';
import { CloseIcon } from '@/frontend/svg/Icons';
import type { WorkType } from '@/types/ProfileData';
import '@/frontend/css/Community.css';

const TYPE_LABELS: Record<WorkType, string> = {
  freelance: 'Freelance',
  full_time: 'Full-time',
  contract: 'Contract',
  commissions: 'Commission',
};

type HireDialogProps = {
  username: string;
  // What the artist said they're open to (preselects/limits the type).
  workTypes: WorkType[];
  onClose: () => void;
  onSent: () => void;
};

// "Hire me": a structured first message (project, type, budget, timeline).
export default function HireDialog({ username, workTypes, onClose, onSent }: HireDialogProps) {
  const { token } = useAuth();
  const types = workTypes.length > 0 ? workTypes : (Object.keys(TYPE_LABELS) as WorkType[]);
  const [form, setForm] = useState({ projectTitle: '', workType: types[0], budget: '', timeline: '', details: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const set = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      await apiFetch(`/api/messages/${encodeURIComponent(username)}/hire`, {
        method: 'POST',
        token,
        body: {
          projectTitle: form.projectTitle.trim(),
          workType: form.workType,
          budget: form.budget.trim() || undefined,
          timeline: form.timeline.trim() || undefined,
          details: form.details.trim(),
        },
      });
      onSent();
    } catch (err) {
      setError((err as Error).message);
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Hire @${username}`}>
        <header>
          <h3>Hire @{username}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </header>
        <form onSubmit={submit}>
          <div className="modal-body">
            <label className="form-field">
              Project
              <input required maxLength={160} value={form.projectTitle} onChange={(e) => set('projectTitle', e.target.value)} placeholder="e.g. Stylized weapon set for a mobile game" />
            </label>
            <div className="form-row">
              <label className="form-field">
                Type
                <select value={form.workType} onChange={(e) => set('workType', e.target.value)}>
                  {types.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </label>
              <label className="form-field">
                Budget
                <input maxLength={80} value={form.budget} onChange={(e) => set('budget', e.target.value)} placeholder="e.g. $1,500" />
              </label>
              <label className="form-field">
                Timeline
                <input maxLength={80} value={form.timeline} onChange={(e) => set('timeline', e.target.value)} placeholder="e.g. 4 weeks" />
              </label>
            </div>
            <label className="form-field">
              Details
              <textarea required maxLength={5000} value={form.details} onChange={(e) => set('details', e.target.value)} placeholder="Scope, style references, deliverables, poly budget…" />
            </label>
            {error && <p className="form-error">{error}</p>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={sending}>{sending ? 'Sending…' : 'Send request'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
