import { useState } from 'react';
import { publishStatus, type PublishingState, type Visibility } from '@/types/PortfolioPiece';

type PublishingPanelProps = {
  publishing: PublishingState;
  onChange: (fields: Partial<PublishingState>) => void;
};

const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: 'public', label: 'Public', hint: 'Listed on your profile, Explore and search' },
  { value: 'unlisted', label: 'Unlisted', hint: 'Only people with the link can see it' },
  { value: 'private', label: 'Private', hint: 'Only you can see it' },
];

// <input type="datetime-local"> works in local time without a zone.
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// Owner-only controls for an artwork's publishing state and content flags.
export default function PublishingPanel({ publishing, onChange }: PublishingPanelProps) {
  const status = publishStatus(publishing.publishedAt);
  const [scheduleDraft, setScheduleDraft] = useState(() =>
    toLocalInput(status === 'scheduled' ? publishing.publishedAt! : new Date(Date.now() + 86_400_000).toISOString())
  );

  const visibilityHint = VISIBILITY_OPTIONS.find(o => o.value === publishing.visibility)?.hint;

  return (
    <section className="publishing-panel" aria-label="Publishing">
      <div className="publishing-status">
        <span className={`content-badge ${status}`}>
          {status === 'draft' ? 'Draft' : status === 'scheduled' ? 'Scheduled' : 'Published'}
        </span>
        <span className="publishing-status-text">
          {status === 'draft' && 'Only you can see drafts.'}
          {status === 'scheduled' && `Goes live ${formatDateTime(publishing.publishedAt!)}.`}
          {status === 'published' && `Live since ${formatDateTime(publishing.publishedAt!)} · ${publishing.viewCount} views`}
        </span>
      </div>

      <div className="publishing-actions">
        {status !== 'published' && (
          <button className="action-btn primary" onClick={() => onChange({ publishedAt: new Date().toISOString() })}>
            Publish now
          </button>
        )}
        {status !== 'draft' && (
          <button className="action-btn secondary" onClick={() => onChange({ publishedAt: null })}>
            Move to drafts
          </button>
        )}
        <label className="publishing-schedule">
          <span>Schedule</span>
          <input
            type="datetime-local"
            value={scheduleDraft}
            min={toLocalInput(new Date().toISOString())}
            onChange={(e) => setScheduleDraft(e.target.value)}
          />
          <button
            className="action-btn secondary"
            disabled={!scheduleDraft}
            onClick={() => {
              const when = new Date(scheduleDraft);
              // A time that's already passed just publishes it now.
              onChange({ publishedAt: (when.getTime() > Date.now() ? when : new Date()).toISOString() });
            }}
          >
            {status === 'scheduled' ? 'Reschedule' : 'Schedule'}
          </button>
        </label>
      </div>

      <div className="publishing-fields">
        <label className="publishing-field">
          <span>Visibility</span>
          <select
            value={publishing.visibility}
            onChange={(e) => onChange({ visibility: e.target.value as Visibility })}
          >
            {VISIBILITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <small>{visibilityHint}</small>
        </label>

        <label className="publishing-toggle">
          <input
            type="checkbox"
            checked={publishing.isMature}
            onChange={(e) => onChange({ isMature: e.target.checked })}
          />
          <span>
            Mature content
            <small>Nudity, gore or other 18+ material - blurred for viewers who haven't opted in</small>
          </span>
        </label>

        <label className="publishing-toggle">
          <input
            type="checkbox"
            checked={publishing.aiGenerated}
            onChange={(e) => onChange({ aiGenerated: e.target.checked })}
          />
          <span>
            Made with generative AI
            <small>Labelled as AI, and hidden for viewers who filter AI work out</small>
          </span>
        </label>
      </div>
    </section>
  );
}
