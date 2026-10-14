import { useState } from 'react';
import { useAuth } from '@/frontend/hooks/useAuth';
import { apiFetch } from '@/frontend/utils/api';
import { CloseIcon } from '@/frontend/svg/Icons';
import '@/frontend/css/Community.css';

export type ReportTarget = {
  type: 'artwork' | 'comment' | 'user' | 'message';
  // Artwork/comment/message id, or username for users.
  id: string;
  label: string;
};

const REASONS: { value: string; label: string; for?: ReportTarget['type'][] }[] = [
  { value: 'spam', label: 'Spam or scam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate', label: 'Hateful content' },
  { value: 'violence', label: 'Violence or threats' },
  { value: 'unlabeled_mature', label: 'Mature content not marked 18+', for: ['artwork'] },
  { value: 'stolen_work', label: "Stolen or uncredited work (it's not theirs)", for: ['artwork'] },
  { value: 'unlabeled_ai', label: 'AI-generated but not labelled as AI', for: ['artwork'] },
  { value: 'impersonation', label: 'Impersonating someone', for: ['user'] },
  { value: 'other', label: 'Something else' },
];

type ReportDialogProps = {
  target: ReportTarget;
  onClose: () => void;
};

export default function ReportDialog({ target, onClose }: ReportDialogProps) {
  const { token } = useAuth();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  const reasons = REASONS.filter(r => !r.for || r.for.includes(target.type));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    setState('sending');
    setError('');
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        token,
        body: { targetType: target.type, targetId: target.id, reason, details: details.trim() || undefined },
      });
      setState('sent');
    } catch (err) {
      setError((err as Error).message);
      setState('idle');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Report ${target.type}`}>
        <header>
          <h3>Report {target.type === 'user' ? `@${target.label}` : target.type}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </header>

        {state === 'sent' ? (
          <>
            <div className="modal-body">
              <p>Thanks - our moderators will take a look. You'll get a notification once it's been reviewed.</p>
            </div>
            <div className="modal-footer">
              <button className="btn primary" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="modal-body">
              {target.type !== 'user' && <p className="report-target">“{target.label}”</p>}
              {target.type === 'message' && (
                <p className="report-note">Moderators will see this message so they can review it.</p>
              )}
              <fieldset className="report-reasons">
                <legend>What's wrong?</legend>
                {reasons.map(r => (
                  <label key={r.value} className="form-check">
                    <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
                    {r.label}
                  </label>
                ))}
              </fieldset>
              <label className="form-field">
                Anything else moderators should know? (optional)
                <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
              </label>
              {error && <p className="form-error">{error}</p>}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn primary" disabled={!reason || state === 'sending'}>
                {state === 'sending' ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
