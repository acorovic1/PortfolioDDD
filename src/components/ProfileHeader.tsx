import type { ProfileData } from '../types/ProfileData';

type ProfileHeaderProps = {
  profile: ProfileData;
  editable: boolean;
  onUpdate: (key: keyof ProfileData, value: string) => void;
};

export default function ProfileHeader({ profile, editable, onUpdate }: ProfileHeaderProps) {
  return (
    <div className="profile-header">
      <div className="avatar-container">
        <img src={profile.avatarUrl} alt={profile.name} className="avatar" />
        {editable && (
          <button className="avatar-edit-btn" title="Change photo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>
        )}
        <div className="status-indicator" title="Available"></div>
      </div>

      {editable ? (
        <input
          className="name-input"
          value={profile.name}
          onChange={(e) => onUpdate('name', e.target.value)}
          placeholder="Your Name"
        />
      ) : (
        <h2 className="profile-name">{profile.name}</h2>
      )}

      {editable ? (
        <input
          className="title-input"
          value={profile.title}
          onChange={(e) => onUpdate('title', e.target.value)}
          placeholder="Your Title"
        />
      ) : (
        <p className="profile-title">{profile.title}</p>
      )}
    </div>
  );
}