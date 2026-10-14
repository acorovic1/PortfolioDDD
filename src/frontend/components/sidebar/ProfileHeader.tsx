import { useRef, useState } from 'react';
import { responsiveImage } from '@/frontend/utils/images';
import { useI18n } from '@/frontend/hooks/useI18n';
import { uploadErrorText } from '@/frontend/utils/storageQuota';
import type { ProfileHeaderProps } from '@/types/ProfileData';
import { PhotoIcon } from '@/frontend/svg/Icons';



export default function ProfileHeader({ profile, editable, onUpdate, onAvatarUpload }: ProfileHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();
  const [uploadError, setUploadError] = useState('');

  return (
    <div className="profile-header">
      <div className="avatar-container">
        <img {...responsiveImage(profile.avatarUrl, [160, 320])} sizes="110px" alt={profile.username || 'Profile'} className="avatar" />
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
                if (file) {
                  setUploadError('');
                  onAvatarUpload?.(file).catch(error => setUploadError(uploadErrorText(error, t)));
                }
                e.target.value = '';
              }}
            />
          </>
        )}
        <div className="status-indicator" title="Available"></div>
      </div>

      {uploadError && <p className="profile-upload-error" role="alert">{uploadError}</p>}

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
