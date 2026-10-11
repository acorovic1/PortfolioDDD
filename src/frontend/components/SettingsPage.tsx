import { useEffect, useState } from 'react';
import { apiFetch, profilePath } from '@/frontend/utils/api';
import '@/frontend/css/SettingsPage.css';
import { useAuth } from '@/frontend/hooks/useAuth';
import { useTheme } from '@/frontend/hooks/useTheme';
import { SunIcon, MoonIcon } from '@/frontend/svg/Icons';
import SecuritySection from '@/frontend/components/settings/SecuritySection';
import CustomDomainSection from '@/frontend/components/settings/CustomDomainSection';
import { useI18n } from '@/frontend/hooks/useI18n';
import { LOCALES, isLocale } from '@/frontend/i18n/i18n-context';

export default function SettingsPage() {
    const {
        user, token, updateUsername, updateEmail, changePassword, deleteAccount, updateProfile, resendVerification,
    } = useAuth();
    const { t, locale, setLocale } = useI18n();
    const [verificationSent, setVerificationSent] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const profileUrl = user ? `${window.location.origin}${profilePath(user.username)}` : '';
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
            setPreferenceError(err instanceof Error ? err.message : t('security.error'));
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
            setUsernameError(err instanceof Error ? err.message : t('security.error'));
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
            setEmailError(err instanceof Error ? err.message : t('security.error'));
        }
    };

    const handleDeleteAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setDeleteError('');

        if (!confirm(t('settings.deleteConfirm'))) {
            return;
        }

        setIsDeleting(true);
        try {
            await deleteAccount(deletePassword);
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message : t('security.error'));
            setIsDeleting(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError('');

        if (newPassword.length < 6) {
            setPasswordError(t('settings.passwordTooShort'));
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordError(t('settings.passwordsDiffer'));
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
            setPasswordError(err instanceof Error ? err.message : t('security.error'));
        }
    };

    return (
        <div className="settings-page">
            <div className="activity-hero">
                <h2>{t('settings.title')}</h2>
                <p>{t('settings.subtitle')}</p>
            </div>

            <div className="settings-sections">
                <section className="settings-section">
                    <h3 className="settings-section-title">{t('settings.username')}</h3>
                    <form className="settings-form" onSubmit={handleUsernameSubmit}>
                        <input
                            className="settings-input"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder={t('settings.username')}
                            minLength={3}
                        />
                        <button type="submit" className="settings-save-btn" disabled={!username.trim()}>
                            {t('common.save')}
                        </button>
                        {usernameError && <span className="settings-error-hint">{usernameError}</span>}
                        {usernameSaved && <span className="settings-saved-hint">{t('common.saved')}</span>}
                    </form>
                    <p className="settings-section-description settings-profile-link">
                        {t('settings.profileLink')} <a href={profilePath(user?.username ?? '')}>{profileUrl}</a>
                        <button
                            type="button"
                            className="settings-link-btn"
                            onClick={() => navigator.clipboard.writeText(profileUrl).then(() => setLinkCopied(true))}
                        >
                            {t(linkCopied ? 'common.copied' : 'common.copy')}
                        </button>
                        <br />
                        {t('settings.profileLinkHint')}
                    </p>
                </section>

                <CustomDomainSection />

                <section className="settings-section">
                    <h3 className="settings-section-title">{t('settings.email')}</h3>
                    <form className="settings-form" onSubmit={handleEmailSubmit}>
                        <input
                            type="email"
                            className="settings-input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="email@example.com"
                        />
                        <button type="submit" className="settings-save-btn" disabled={!email.trim()}>
                            {t('common.save')}
                        </button>
                        {emailError && <span className="settings-error-hint">{emailError}</span>}
                        {emailSaved && <span className="settings-saved-hint">{t('settings.emailSaved')}</span>}
                    </form>
                    {user?.emailVerified ? (
                        <p className="settings-section-description settings-email-status">{t('settings.emailConfirmed')}</p>
                    ) : (
                        <p className="settings-section-description settings-email-status unconfirmed">
                            {t('settings.emailUnconfirmed')}{' '}
                            {verificationSent ? t('settings.emailCheckInbox') : (
                                <button
                                    type="button"
                                    className="settings-link-btn"
                                    onClick={() => resendVerification()
                                        .then(() => setVerificationSent(true))
                                        .catch(err => setEmailError(err instanceof Error ? err.message : t('security.error')))}
                                >
                                    {t('settings.emailResend')}
                                </button>
                            )}
                        </p>
                    )}
                </section>

                <section className="settings-section">
                    <h3 className="settings-section-title">{t('settings.password')}</h3>
                    <form className="settings-form settings-form-column" onSubmit={handlePasswordSubmit}>
                        <input
                            type="password"
                            className="settings-input"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder={t('settings.currentPassword')}
                            autoComplete="current-password"
                        />
                        <input
                            type="password"
                            className="settings-input"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder={t('settings.newPassword')}
                            autoComplete="new-password"
                            minLength={6}
                        />
                        <input
                            type="password"
                            className="settings-input"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder={t('settings.confirmPassword')}
                            autoComplete="new-password"
                        />
                        {passwordError && <span className="settings-error-hint">{passwordError}</span>}
                        <div className="settings-form-row">
                            <button
                                type="submit"
                                className="settings-save-btn"
                                disabled={!currentPassword || !newPassword || !confirmPassword}
                            >
                                {t('settings.updatePassword')}
                            </button>
                            {passwordSaved && <span className="settings-saved-hint">{t('common.saved')}</span>}
                        </div>
                    </form>
                </section>

                <SecuritySection />

                <section className="settings-section">
                    <h3 className="settings-section-title">{t('settings.content')}</h3>
                    <div className="settings-preferences">
                        <label className="settings-preference">
                            <input
                                type="checkbox"
                                checked={!!user?.showMature}
                                onChange={(e) => setPreference('showMature', e.target.checked)}
                            />
                            <span>
                                {t('settings.showMature')}
                                <small>{t('settings.showMatureHint')}</small>
                            </span>
                        </label>
                        <label className="settings-preference">
                            <input
                                type="checkbox"
                                checked={!!user?.hideAi}
                                onChange={(e) => setPreference('hideAi', e.target.checked)}
                            />
                            <span>
                                {t('settings.hideAi')}
                                <small>{t('settings.hideAiHint')}</small>
                            </span>
                        </label>
                        <label className="settings-preference">
                            <input
                                type="checkbox"
                                checked={!!user?.noAiTraining}
                                onChange={(e) => setPreference('noAiTraining', e.target.checked)}
                            />
                            <span>
                                {t('settings.noAi')}
                                <small>{t('settings.noAiHint')}</small>
                            </span>
                        </label>
                        {preferenceError && <span className="settings-error-hint">{preferenceError}</span>}
                    </div>
                </section>

                <section className="settings-section">
                    <h3 className="settings-section-title">{t('settings.notifications')}</h3>
                    <div className="settings-preferences">
                        <label className="settings-preference">
                            <input
                                type="checkbox"
                                checked={user?.emailNotifications !== false}
                                onChange={(e) => setPreference('emailNotifications', e.target.checked)}
                            />
                            <span>
                                {t('settings.emailNotifications')}
                                <small>{t('settings.emailNotificationsHint')}</small>
                            </span>
                        </label>
                    </div>
                </section>

                <section className="settings-section">
                    <h3 className="settings-section-title">{t('settings.blocked')}</h3>
                    {blockedUsers.length === 0 ? (
                        <p className="settings-section-description">{t('settings.blockedEmpty')}</p>
                    ) : (
                        <ul className="settings-blocked-list">
                            {blockedUsers.map(u => (
                                <li key={u.username}>
                                    <span>@{u.username}</span>
                                    <button className="settings-save-btn" onClick={() => unblock(u.username)}>{t('settings.unblock')}</button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="settings-section settings-section-danger">
                    <h3 className="settings-section-title">{t('settings.danger')}</h3>
                    <p className="settings-section-description">
                        {t('settings.dangerHint')}
                    </p>
                    <form className="settings-form" onSubmit={handleDeleteAccount}>
                        <input
                            type="password"
                            className="settings-input"
                            value={deletePassword}
                            onChange={(e) => setDeletePassword(e.target.value)}
                            placeholder={t('settings.confirmPasswordPlaceholder')}
                            autoComplete="current-password"
                        />
                        <button
                            type="submit"
                            className="settings-delete-btn"
                            disabled={!deletePassword || isDeleting}
                        >
                            {t(isDeleting ? 'settings.deleting' : 'settings.deleteAccount')}
                        </button>
                        {deleteError && <span className="settings-error-hint">{deleteError}</span>}
                    </form>
                </section>

                <section className="settings-section">
                    <h3 className="settings-section-title">{t('settings.appearance')}</h3>
                    <button className="theme-toggle-btn" onClick={toggleTheme}>
                        {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
                        <span>{t(theme === 'dark' ? 'settings.darkMode' : 'settings.lightMode')}</span>
                        <span className={`theme-toggle-switch ${theme === 'light' ? 'on' : ''}`}>
                            <span className="theme-toggle-knob" />
                        </span>
                    </button>
                </section>

                <section className="settings-section">
                    <h3 className="settings-section-title">{t('settings.language')}</h3>
                    <p className="settings-section-description">{t('settings.languageHint')}</p>
                    <select
                        className="settings-input"
                        value={locale}
                        onChange={(e) => { if (isLocale(e.target.value)) setLocale(e.target.value); }}
                        aria-label={t('settings.language')}
                    >
                        {LOCALES.map(l => <option key={l.code} value={l.code} lang={l.code}>{l.name}</option>)}
                    </select>
                </section>
            </div>
        </div>
    );
}
