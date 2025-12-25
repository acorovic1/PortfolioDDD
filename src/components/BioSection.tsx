import type { ProfileData } from '../types/ProfileData';

type BioSectionProps = {
  profile: ProfileData;
  editable: boolean;
  onUpdate: (key: keyof ProfileData, value: string) => void;
};

export default function BioSection({ profile, editable, onUpdate }: BioSectionProps) {
  return (
    <div className="bio-section">
      <h3 className="section-title">About</h3>
      {editable ? (
        <textarea
          className="bio-textarea"
          value={profile.bio ?? ''}
          onChange={(e) => onUpdate('bio', e.target.value)}
          placeholder="Tell us about yourself..."
          rows={4}
        />
      ) : (
        <p className="bio-text">{profile.bio || 'No bio added yet.'}</p>
      )}
    </div>
  );
}