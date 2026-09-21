import { useRef } from 'react';
import type { ProfileHeaderProps } from '@/types/ProfileData';
import { PhotoIcon } from '@/frontend/svg/Icons';



export default function ProfileHeader({ profile, editable, onUpdate, onAvatarUpload }: ProfileHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="profile-header">
      <div className="avatar-container">
        <img src={profile.avatarUrl} alt={profile.username || 'Profile'} className="avatar" />
        {editable && (
          <>
            <button
              className="avatar-edit-btn"
              title="Change photo"
              onClick={() => fileInputRef.current?.click()}
            >
              <PhotoIcon />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onAvatarUpload?.(file);
                e.target.value = '';
              }}
            />
          </>
        )}
        <div className="status-indicator" title="Available"></div>
      </div>

      <h2 className="profile-name">{profile.username}</h2>

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
