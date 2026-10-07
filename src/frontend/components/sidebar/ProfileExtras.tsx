import { useRef, useState } from 'react';
import CommitInput from './CommitInput';
import type { ProfileData, SocialNetwork, WorkType, ExperienceEntry } from '@/types/ProfileData';
import { safeUrl, displayUrl, validateLink } from '@/frontend/utils/safeUrl';
import { PhotoIcon, LinkIcon, PlusIcon, BriefcaseIcon } from '@/frontend/svg/Icons';

type SectionProps = {
  profile: ProfileData;
  editable: boolean;
  onUpdate: <K extends keyof ProfileData>(key: K, value: ProfileData[K]) => void;
};

// --- Cover banner ---

export function CoverBanner({ profile, editable, onCoverUpload }: {
  profile: ProfileData;
  editable: boolean;
  onCoverUpload?: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  if (!profile.coverUrl && !editable) return null;

  return (
    <div
      className={`profile-cover ${profile.coverUrl ? '' : 'empty'}`}
      style={profile.coverUrl ? { backgroundImage: `url("${profile.coverUrl}")` } : undefined}
    >
      {editable && (
        <>
          <button className="profile-cover-edit" onClick={() => inputRef.current?.click()}>
            <PhotoIcon /> {profile.coverUrl ? 'Change cover' : 'Add cover image'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onCoverUpload?.(file);
              e.target.value = '';
            }}
          />
        </>
      )}
    </div>
  );
}

// --- Availability ---

const WORK_TYPES: { value: WorkType; label: string }[] = [
  { value: 'freelance', label: 'Freelance' },
  { value: 'full_time', label: 'Full-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'commissions', label: 'Commissions' },
];

export function AvailabilitySection({ profile, editable, onUpdate }: SectionProps) {
  const workTypes = profile.workTypes ?? [];

  if (!editable) {
    if (!profile.availableForWork) return null;
    return (
      <div className="availability-badge">
        <BriefcaseIcon />
        <span>
          Available for work
          {workTypes.length > 0 && <small>{workTypes.map(t => WORK_TYPES.find(w => w.value === t)?.label).join(' · ')}</small>}
        </span>
      </div>
    );
  }

  return (
    <div className="availability-section">
      <label className="form-check">
        <input
          type="checkbox"
          checked={!!profile.availableForWork}
          onChange={(e) => onUpdate('availableForWork', e.target.checked)}
        />
        Available for work
      </label>
      {profile.availableForWork && (
        <div className="availability-types">
          {WORK_TYPES.map(type => (
            <label key={type.value} className="form-check">
              <input
                type="checkbox"
                checked={workTypes.includes(type.value)}
                onChange={(e) => onUpdate('workTypes', e.target.checked
                  ? [...workTypes, type.value]
                  : workTypes.filter(t => t !== type.value))}
              />
              {type.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Website & social links ---

const NETWORKS: { key: SocialNetwork; label: string; placeholder: string }[] = [
  { key: 'artstation', label: 'ArtStation', placeholder: 'artstation.com/you' },
  { key: 'sketchfab', label: 'Sketchfab', placeholder: 'sketchfab.com/you' },
  { key: 'instagram', label: 'Instagram', placeholder: 'instagram.com/you' },
  { key: 'x', label: 'X', placeholder: 'x.com/you' },
  { key: 'youtube', label: 'YouTube', placeholder: 'youtube.com/@you' },
  { key: 'behance', label: 'Behance', placeholder: 'behance.net/you' },
];

export function LinksSection({ profile, editable, onUpdate }: SectionProps) {
  const links = profile.socialLinks ?? {};

  if (editable) {
    return (
      <div className="links-section">
        <h3 className="section-title">Links</h3>
        <label className="links-edit">
          <span>Website</span>
          <CommitInput
            value={profile.website ?? ''}
            onCommit={(value) => onUpdate('website', value.trim())}
            validate={validateLink}
            placeholder="yourportfolio.com"
          />
        </label>
        {NETWORKS.map(network => (
          <label key={network.key} className="links-edit">
            <span>{network.label}</span>
            <CommitInput
              value={links[network.key] ?? ''}
              onCommit={(value) => onUpdate('socialLinks', { ...links, [network.key]: value.trim() })}
              validate={validateLink}
              placeholder={network.placeholder}
            />
          </label>
        ))}
      </div>
    );
  }

  const items = [
    { label: 'Website', url: safeUrl(profile.website) },
    ...NETWORKS.map(n => ({ label: n.label, url: safeUrl(links[n.key]) })),
  ].filter((item): item is { label: string; url: string } => item.url !== null);
  if (items.length === 0) return null;

  return (
    <div className="links-section">
      <h3 className="section-title">Links</h3>
      <ul className="links-list">
        {items.map(item => (
          <li key={item.label}>
            <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" title={item.url}>
              <LinkIcon />
              <span><strong>{item.label}</strong> {displayUrl(item.url)}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Experience ---

function formatPeriod(entry: ExperienceEntry): string {
  const format = (value: string) => {
    const [year, month] = value.split('-');
    return month ? new Date(Number(year), Number(month) - 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : year;
  };
  return `${format(entry.start)} – ${entry.end ? format(entry.end) : 'Present'}`;
}

const DATE_PATTERN = /^\d{4}(-\d{2})?$/;
const EMPTY_ENTRY: ExperienceEntry = { role: '', company: '', location: '', start: '', end: '', description: '' };

// Add/edit form for one entry; only a complete, valid entry can be saved
// (the server rejects the whole list otherwise).
function ExperienceForm({ initial, onSave, onCancel }: {
  initial: ExperienceEntry;
  onSave: (entry: ExperienceEntry) => void;
  onCancel: () => void;
}) {
  const [entry, setEntry] = useState<ExperienceEntry>({ ...EMPTY_ENTRY, ...initial });
  const set = (key: keyof ExperienceEntry, value: string) => setEntry(prev => ({ ...prev, [key]: value }));

  const errors = [
    !entry.role.trim() && 'Add a role',
    !DATE_PATTERN.test(entry.start.trim()) && 'Start must be YYYY or YYYY-MM',
    entry.end && !DATE_PATTERN.test(entry.end.trim()) && 'End must be YYYY or YYYY-MM (or empty)',
  ].filter(Boolean) as string[];

  return (
    <form
      className="experience-edit"
      onSubmit={(e) => {
        e.preventDefault();
        if (errors.length > 0) return;
        onSave({
          role: entry.role.trim(),
          company: entry.company.trim(),
          location: entry.location?.trim() || undefined,
          start: entry.start.trim(),
          end: entry.end?.trim() || '',
          description: entry.description?.trim() || undefined,
        });
      }}
    >
      <input value={entry.role} onChange={(e) => set('role', e.target.value)} placeholder="Role (e.g. Senior Prop Artist)" aria-label="Role" />
      <input value={entry.company} onChange={(e) => set('company', e.target.value)} placeholder="Studio / company" aria-label="Company" />
      <input value={entry.location ?? ''} onChange={(e) => set('location', e.target.value)} placeholder="Location (optional)" aria-label="Location" />
      <div className="experience-dates">
        <input value={entry.start} onChange={(e) => set('start', e.target.value)} placeholder="From: 2021-03" aria-label="Start" />
        <input value={entry.end ?? ''} onChange={(e) => set('end', e.target.value)} placeholder="To (empty = now)" aria-label="End" />
      </div>
      <textarea value={entry.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="What you worked on" aria-label="Description" />
      {errors.length > 0 && entry.role !== '' && <small className="input-error">{errors[0]}</small>}
      <div className="experience-form-actions">
        <button type="button" className="btn small" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn small primary" disabled={errors.length > 0}>Save</button>
      </div>
    </form>
  );
}

export function ExperienceSection({ profile, editable, onUpdate }: SectionProps) {
  const entries = profile.experience ?? [];
  // Index being edited; entries.length = adding a new one.
  const [editing, setEditing] = useState<number | null>(null);
  if (!editable && entries.length === 0) return null;

  const save = (index: number, entry: ExperienceEntry) => {
    const next = index === entries.length
      ? [entry, ...entries]
      : entries.map((existing, i) => (i === index ? entry : existing));
    onUpdate('experience', next);
    setEditing(null);
  };

  return (
    <div className="experience-section">
      <div className="section-header">
        <h3 className="section-title">Experience</h3>
        {editable && editing === null && (
          <button className="add-btn" title="Add experience" onClick={() => setEditing(entries.length)}>
            <PlusIcon />
          </button>
        )}
      </div>

      {editing === entries.length && (
        <ExperienceForm
          initial={{ ...EMPTY_ENTRY, start: String(new Date().getFullYear()) }}
          onSave={(entry) => save(entries.length, entry)}
          onCancel={() => setEditing(null)}
        />
      )}

      {entries.length > 0 && (
        <ol className="experience-list">
          {entries.map((entry, i) => (
            <li key={`${entry.role}-${entry.start}-${i}`} className="experience-item">
              {editing === i ? (
                <ExperienceForm initial={entry} onSave={(updated) => save(i, updated)} onCancel={() => setEditing(null)} />
              ) : (
                <>
                  <strong>{entry.role}</strong>
                  {entry.company && <span className="experience-company">{entry.company}</span>}
                  <span className="experience-period">{formatPeriod(entry)}{entry.location ? ` · ${entry.location}` : ''}</span>
                  {entry.description && <p>{entry.description}</p>}
                  {editable && editing === null && (
                    <span className="experience-item-actions">
                      <button className="btn small" onClick={() => setEditing(i)}>Edit</button>
                      <button className="btn small danger" onClick={() => onUpdate('experience', entries.filter((_, j) => j !== i))}>Remove</button>
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
