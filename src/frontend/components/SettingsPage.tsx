import { useEffect, useState } from 'react';
import { apiFetch } from '@/frontend/utils/api';
import '@/frontend/css/SettingsPage.css';
import { useAuth } from '@/frontend/hooks/useAuth';
import { useTheme } from '@/frontend/hooks/useTheme';
import { SunIcon, MoonIcon } from '@/frontend/svg/Icons';
import SecuritySection from '@/frontend/components/settings/SecuritySection';

export default function SettingsPage() {
    const {
        user, token, updateUsername, updateEmail, changePassword, deleteAccount, updateProfile, resendVerification,
    } = useAuth();
    const [verificationSent, setVerificationSent] = useState(false);
    const [preferenceError, setPreferenceError] = useState('');
    const [blockedUsers, setBlockedUsers] = useState<{ username: string }[]>([]);

    useEffect(() => {
        if (!token) return;
        apiFetch<{ users: { username: string }[] }>('/api/users/me/blocks', { token })
            .then(data => setBlockedUsers(data.users))
            .catch(err => console.error('Failed to load blocked users:', err));
    }, [token]);

    const unblock = (username: string) => {
        setBlockedUsers(prev => prev.filter(u => u.username !== username));
        apiFetch(`/api/users/${encodeURIComponent(username)}/block`, { method: 'DELETE', token })
            .catch(err => console.error('Failed to unblock:', err));
    };

    const setPreference = (key: 'showMature' | 'hideAi' | 'noAiTraining' | 'emailNotifications', value: boolean) => {
        setPreferenceError('');
        updateProfile({ [key]: value }).catch(err => {
            setPreferenceError(err instanceof Error ? err.message : 'Failed to save preference');
        });
    };
    const { theme, toggleTheme } = useTheme();

    const [deletePassword, setDeletePassword] = useState('');
    const [deleteError, setDeleteError] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const [username, setUsername] = useState(user?.username ?? '');
    const [usernameSaved, setUsernameSaved] = useState(false);
    const [usernameError, setUsernameError] = useState('');

    const [email, setEmail] = useState(user?.email ?? '');
    const [emailSaved, setEmailSaved] = useState(false);
    const [emailError, setEmailError] = useState('');

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [passwordSaved, setPasswordSaved] = useState(false);

    const handleUsernameSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setUsernameError('');
        const trimmed = username.trim();
        if (!trimmed) return;

        try {
            await updateUsername(trimmed);
            setUsernameSaved(true);
            setTimeout(() => setUsernameSaved(false), 2000);
        } catch (err) {
            setUsernameError(err instanceof Error ? err.message : 'Failed to update username');
        }
    };

    const handleEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setEmailError('');
        const trimmed = email.trim();
        if (!trimmed) return;

        try {
            await updateEmail(trimmed);
            setEmailSaved(true);
            setTimeout(() => setEmailSaved(false), 2000);
        } catch (err) {
            setEmailError(err instanceof Error ? err.message : 'Failed to update email');
        }
    };

    const handleDeleteAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setDeleteError('');

        if (!confirm('This will permanently delete your account, artworks, and all associated data. This cannot be undone. Continue?')) {
            return;
        }

        setIsDeleting(true);
        try {
            await deleteAccount(deletePassword);
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message : 'Failed to delete account');
            setIsDeleting(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError('');

        if (newPassword.length < 6) {
            setPasswordError('New password must be at least 6 characters');
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordError('New passwords do not match');
            return;
        }

        try {
            await changePassword(currentPassword, newPassword);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setPasswordSaved(true);
            setTimeout(() => setPasswordSaved(false), 2000);
        } catch (err) {
            setPasswordError(err instanceof Error ? err.message : 'Failed to change password');
        }
    };

    return (
        <div className="settings-page">
            <div className="activity-hero">
                <h2>Settings</h2>
                <p>Manage your account and app preferences.</p>
            </div>

            <div className="settings-sections">
                <section className="settings-section">
                    <h3 className="settings-section-title">Username</h3>
                    <form className="settings-form" onSubmit={handleUsernameSubmit}>
                        <input
                            className="settings-input"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Username"
                            minLength={3}
                        />
                        <button type="submit" className="settings-save-btn" disabled={!username.trim()}>
                            Save
                        </button>
                        {usernameError && <span className="settings-error-hint">{usernameError}</span>}
                        {usernameSaved && <span className="settings-saved-hint">Saved</span>}
                    </form>
                </section>

                <section className="settings-section">
                    <h3 className="settings-section-title">Email</h3>
                    <form className="settings-form" onSubmit={handleEmailSubmit}>
                        <input
                            type="email"
                            className="settings-input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="email@example.com"
                        />
                        <button type="submit" className="settings-save-btn" disabled={!email.trim()}>
                            Save
                        </button>
                        {emailError && <span className="settings-error-hint">{emailError}</span>}
                        {emailSaved && <span className="settings-saved-hint">Saved - check your inbox to confirm it</span>}
                    </form>
                    {user?.emailVerified ? (
                        <p className="settings-section-description settings-email-status">Confirmed</p>
                    ) : (
                        <p className="settings-section-description settings-email-status unconfirmed">
                            Not confirmed yet.{' '}
                            {verificationSent ? 'Check your inbox for the link.' : (
                                <button
                                    type="button"
                                    className="settings-link-btn"
                                    onClick={() => resendVerification()
                                        .then(() => setVerificationSent(true))
                                        .catch(err => setEmailError(err instanceof Error ? err.message : 'Failed to send'))}
                                >
                                    Resend confirmation email
                                </button>
                            )}
                        </p>
                    )}
                </section>

                <section className="settings-section">
                    <h3 className="settings-section-title">Change Password</h3>
                    <form className="settings-form settings-form-column" onSubmit={handlePasswordSubmit}>
                        <input
                            type="password"
                            className="settings-input"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="Current password"
                            autoComplete="current-password"
                        />
                        <input
                            type="password"
                            className="settings-input"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="New password"
                            autoComplete="new-password"
                            minLength={6}
                        />
                        <input
                            type="password"
                            className="settings-input"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirm new password"
                            autoComplete="new-password"
                        />
                        {passwordError && <span className="settings-error-hint">{passwordError}</span>}
                        <div className="settings-form-row">
                            <button
                                type="submit"
                                className="settings-save-btn"
                                disabled={!currentPassword || !newPassword || !confirmPassword}
                            >
                                Update Password
                            </button>
                            {passwordSaved && <span className="settings-saved-hint">Saved</span>}
                        </div>
                    </form>
                </section>

                <SecuritySection />

                <section className="settings-section">
                    <h3 className="settings-section-title">Content</h3>
                    <div className="settings-preferences">
                        <label className="settings-preference">
                            <input
                                type="checkbox"
                                checked={!!user?.showMature}
                                onChange={(e) => setPreference('showMature', e.target.checked)}
                            />
                            <span>
                                Show mature content
                                <small>Artworks marked 18+ are blurred until you click them otherwise.</small>
                            </span>
                        </label>
                        <label className="settings-preference">
                            <input
                                type="checkbox"
                                checked={!!user?.hideAi}
                                onChange={(e) => setPreference('hideAi', e.target.checked)}
                            />
                            <span>
                                Hide AI-generated work
                                <small>Leaves artworks labelled as made with generative AI out of Explore.</small>
                            </span>
                        </label>
                        <label className="settings-preference">
                            <input
                                type="checkbox"
                                checked={!!user?.noAiTraining}
                                onChange={(e) => setPreference('noAiTraining', e.target.checked)}
                            />
                            <span>
                                NoAI: opt my work out of AI training
                                <small>Shows a NoAI badge on your profile and asks crawlers not to use your uploads for AI training.</small>
                            </span>
                        </label>
                        {preferenceError && <span className="settings-error-hint">{preferenceError}</span>}
                    </div>
                </section>

                <section className="settings-section">
                    <h3 className="settings-section-title">Notifications</h3>
                    <div className="settings-preferences">
                        <label className="settings-preference">
                            <input
                                type="checkbox"
                                checked={user?.emailNotifications !== false}
                                onChange={(e) => setPreference('emailNotifications', e.target.checked)}
                            />
                            <span>
                                Email me about notifications I haven't seen
                                <small>
                                    New messages, comments, likes and followers you haven't seen on the site
                                    within a few minutes, bundled into one email. Needs a confirmed address.
                                </small>
                            </span>
                        </label>
                    </div>
                </section>

                <section className="settings-section">
                    <h3 className="settings-section-title">Blocked users</h3>
                    {blockedUsers.length === 0 ? (
                        <p className="settings-section-description">You haven't blocked anyone.</p>
                    ) : (
                        <ul className="settings-blocked-list">
                            {blockedUsers.map(u => (
                                <li key={u.username}>
                                    <span>@{u.username}</span>
                                    <button className="settings-save-btn" onClick={() => unblock(u.username)}>Unblock</button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="settings-section settings-section-danger">
                    <h3 className="settings-section-title">Danger Zone</h3>
                    <p className="settings-section-description">
                        Permanently delete your account, all your artworks, renders, comments, likes, and collections.
                    </p>
                    <form className="settings-form" onSubmit={handleDeleteAccount}>
                        <input
                            type="password"
                            className="settings-input"
                            value={deletePassword}
                            onChange={(e) => setDeletePassword(e.target.value)}
                            placeholder="Confirm your password"
                            autoComplete="current-password"
                        />
                        <button
                            type="submit"
                            className="settings-delete-btn"
                            disabled={!deletePassword || isDeleting}
                        >
                            {isDeleting ? 'Deleting...' : 'Delete account'}
                        </button>
                        {deleteError && <span className="settings-error-hint">{deleteError}</span>}
                    </form>
                </section>

                <section className="settings-section">
                    <h3 className="settings-section-title">Appearance</h3>
                    <button className="theme-toggle-btn" onClick={toggleTheme}>
                        {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
                        <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                        <span className={`theme-toggle-switch ${theme === 'light' ? 'on' : ''}`}>
                            <span className="theme-toggle-knob" />
                        </span>
                    </button>
                </section>
            </div>
        </div>
    );
}
