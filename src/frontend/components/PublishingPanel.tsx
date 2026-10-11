import { useState } from 'react';
import { publishStatus, type PublishingState, type Visibility } from '@/types/PortfolioPiece';
import { useI18n } from '@/frontend/hooks/useI18n';
import type { MessageKey } from '@/frontend/i18n/en';

type PublishingPanelProps = {
  publishing: PublishingState;
  onChange: (fields: Partial<PublishingState>) => void;
};

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'publishing.public', hint: 'publishing.publicHint' },
  { value: 'unlisted', label: 'publishing.unlisted', hint: 'publishing.unlistedHint' },
  { value: 'private', label: 'publishing.private', hint: 'publishing.privateHint' },
] as const satisfies readonly { value: Visibility; label: MessageKey; hint: MessageKey }[];

// <input type="datetime-local"> works in local time without a zone.
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

// Owner-only controls for an artwork's publishing state and content flags.
export default function PublishingPanel({ publishing, onChange }: PublishingPanelProps) {
  const { t, tp, formatDateTime } = useI18n();
  const status = publishStatus(publishing.publishedAt);
  const [scheduleDraft, setScheduleDraft] = useState(() =>
    toLocalInput(status === 'scheduled' ? publishing.publishedAt! : new Date(Date.now() + 86_400_000).toISOString())
  );

  const visibilityHint = VISIBILITY_OPTIONS.find(o => o.value === publishing.visibility)?.hint;

  return (
    <section className="publishing-panel" aria-label={t('publishing.label')}>
      <div className="publishing-status">
        <span className={`content-badge ${status}`}>
          {t(status === 'draft' ? 'publishing.draft' : status === 'scheduled' ? 'publishing.scheduled' : 'publishing.published')}
        </span>
        <span className="publishing-status-text">
          {status === 'draft' && t('publishing.draftHint')}
          {status === 'scheduled' && t('publishing.scheduledHint', { date: formatDateTime(publishing.publishedAt!) })}
          {status === 'published' && tp('publishing.publishedHint', publishing.viewCount, { date: formatDateTime(publishing.publishedAt!) })}
        </span>
      </div>

      <div className="publishing-actions">
        {status !== 'published' && (
          <button className="action-btn primary" onClick={() => onChange({ publishedAt: new Date().toISOString() })}>
            {t('publishing.publishNow')}
          </button>
        )}
        {status !== 'draft' && (
          <button className="action-btn secondary" onClick={() => onChange({ publishedAt: null })}>
            {t('publishing.toDrafts')}
          </button>
        )}
        <label className="publishing-schedule">
          <span>{t('publishing.schedule')}</span>
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
            {t(status === 'scheduled' ? 'publishing.reschedule' : 'publishing.schedule')}
          </button>
        </label>
      </div>

      <div className="publishing-fields">
        <label className="publishing-field">
          <span>{t('publishing.visibility')}</span>
          <select
            value={publishing.visibility}
            onChange={(e) => onChange({ visibility: e.target.value as Visibility })}
          >
            {VISIBILITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
          </select>
          <small>{visibilityHint && t(visibilityHint)}</small>
        </label>

        <label className="publishing-toggle">
          <input
            type="checkbox"
            checked={publishing.isMature}
            onChange={(e) => onChange({ isMature: e.target.checked })}
          />
          <span>
            {t('publishing.mature')}
            <small>{t('publishing.matureHint')}</small>
          </span>
        </label>

        <label className="publishing-toggle">
          <input
            type="checkbox"
            checked={publishing.aiGenerated}
            onChange={(e) => onChange({ aiGenerated: e.target.checked })}
          />
          <span>
            {t('publishing.ai')}
            <small>{t('publishing.aiHint')}</small>
          </span>
        </label>
      </div>
    </section>
  );
}
