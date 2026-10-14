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
import ConfirmDialog from '@/frontend/components/ConfirmDialog';
import { formatStorageSize } from '@/frontend/utils/storageQuota';
import type { MessagesFrom } from '@/frontend/contexts/auth-types';

export default function SettingsPage() {
    const {
        user, token, updateUsername, updateEmail, sendPasswordResetLink, deleteAccount, updateProfile, resendVerification,
    } = useAuth();
    const { t, locale, setLocale } = useI18n();
    const [verificationSent, setVerificationSent] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const profileUrl = user ? `${window.location.origin}${profilePath(user.username)}` : '';
    const [preferenceError, setPreferenceError] = useState('');
    const [blockedUsers, setBlockedUsers] = useState<{ username: string }[]>([]);
    const [storage, setStorage] = useState<{ usedBytes: number; quotaBytes: number } | null>(null);

    useEffect(() => {
        if (!token) return;
        apiFetch<{ usedBytes: number; quotaBytes: number }>('/api/users/me/storage', { token })
            .then(setStorage)
            .catch(err => console.error('Failed to load storage usage:', err));
    }, [token]);

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
    const [isDeleting, setIsDeleting] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const [username, setUsername] = useState(user?.username ?? '');
    const [usernameSaved, setUsernameSaved] = useState(false);
    const [usernameError, setUsernameError] = useState('');

    const [email, setEmail] = useState(user?.email ?? '');
    const [emailSaved, setEmailSaved] = useState(false);
    const [emailError, setEmailError] = useState('');
    // Changing the address needs the password (and a code, with two-factor on).
    const [emailPassword, setEmailPassword] = useState('');
    const [emailCode, setEmailCode] = useState('');
    const [emailNeedsCode, setEmailNeedsCode] = useState(false);
    const emailChanged = email.trim().toLowerCase() !== (user?.email ?? '').toLowerCase();

    const [resetLinkSent, setResetLinkSent] = useState(false);
    const [resetLinkSending, setResetLinkSending] = useState(false);
    const [passwordError, setPasswordError] = useState('');

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
            await updateEmail(trimmed, emailPassword, emailNeedsCode ? emailCode : undefined);
            setEmailPassword('');
            setEmailCode('');
            setEmailNeedsCode(false);
            setEmailSaved(true);
            setTimeout(() => setEmailSaved(false), 2000);
        } catch (err) {
            if ((err as { twoFactorRequired?: boolean }).twoFactorRequired) setEmailNeedsCode(true);
            setEmailError(err instanceof Error ? err.message : t('security.error'));
        }
    };

    // Asks in a card first; the card shows a refusal (e.g. a wrong password).
    const handleDeleteAccount = (e: React.FormEvent) => {
        e.preventDefault();
        setConfirmingDelete(true);
    };

    const confirmDeleteAccount = async () => {
        setIsDeleting(true);
        try {
            await deleteAccount(deletePassword);
        } catch (err) {
            setIsDeleting(false);
            throw err instanceof Error ? err : new Error(t('security.error'));
        }
    };

    // The password is changed from a link emailed to the account's address.
    const handleSendResetLink = async () => {
        setPasswordError('');
        setResetLinkSending(true);
        try {
            await sendPasswordResetLink();
            setResetLinkSent(true);
        } catch (err) {
            setPasswordError(err instanceof Error ? err.message : t('security.error'));
        } finally {
            setResetLinkSending(false);
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

                {storage && (
                    <section className="settings-section">
                        <h3 className="settings-section-title">{t('settings.storage')}</h3>
                        <div
                            className={`settings-storage-meter${storage.usedBytes >= storage.quotaBytes ? ' full' : ''}`}
                            role="meter"
                            aria-valuemin={0}
                            aria-valuemax={storage.quotaBytes}
                            aria-valuenow={storage.usedBytes}
                            aria-label={t('settings.storage')}
                        >
                            <div style={{ width: `${Math.min(100, (storage.usedBytes / storage.quotaBytes) * 100)}%` }} />
                        </div>
                        <p className="settings-storage-used">
                            {t('settings.storageUsed', { used: formatStorageSize(storage.usedBytes), quota: formatStorageSize(storage.quotaBytes) })}
                        </p>
                        <p className="settings-section-description">
                            {storage.usedBytes >= storage.quotaBytes ? t('settings.storageFull') : t('settings.storageHint')}
                        </p>
                    </section>
                )}

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
                        {emailChanged && (
                            <input
                                type="password"
                                className="settings-input"
                                value={emailPassword}
                                onChange={(e) => setEmailPassword(e.target.value)}
                                placeholder={t('settings.confirmPasswordPlaceholder')}
                                autoComplete="current-password"
                            />
                        )}
                        {emailChanged && emailNeedsCode && (
                            <input
                                type="text"
                                className="settings-input"
                                value={emailCode}
                                onChange={(e) => setEmailCode(e.target.value)}
                                placeholder={t('security.codeOrRecovery')}
                                autoComplete="one-time-code"
                            />
                        )}
                        <button
                            type="submit"
                            className="settings-save-btn"
                            disabled={!email.trim() || (emailChanged && !emailPassword) || (emailNeedsCode && !emailCode.trim())}
                        >
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
                    <p className="settings-section-description">
                        {resetLinkSent
                            ? t('settings.passwordLinkSent', { email: user?.email ?? '' })
                            : t('settings.passwordViaEmail', { email: user?.email ?? '' })}
                    </p>
                    <div className="settings-form-row">
                        <button
                            type="button"
                            className="settings-save-btn"
                            onClick={handleSendResetLink}
                            disabled={resetLinkSending}
                        >
                            {resetLinkSent ? t('settings.passwordResendLink') : t('settings.passwordSendLink')}
                        </button>
                        {passwordError && <span className="settings-error-hint">{passwordError}</span>}
                    </div>
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
                    <h3 className="settings-section-title">{t('settings.messagesFrom')}</h3>
                    <p className="settings-section-description">{t('settings.messagesFromHint')}</p>
                    <select
                        className="settings-input"
                        value={user?.messagesFrom ?? 'everyone'}
                        onChange={(e) => {
                            setPreferenceError('');
                            updateProfile({ messagesFrom: e.target.value as MessagesFrom }).catch(err => {
                                setPreferenceError(err instanceof Error ? err.message : t('security.error'));
                            });
                        }}
                        aria-label={t('settings.messagesFrom')}
                    >
                        <option value="everyone">{t('settings.messagesFrom.everyone')}</option>
                        <option value="following">{t('settings.messagesFrom.following')}</option>
                        <option value="nobody">{t('settings.messagesFrom.nobody')}</option>
                    </select>
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
                    </form>
                    {confirmingDelete && (
                        <ConfirmDialog
                            title={t('settings.deleteConfirmTitle')}
                            confirmLabel={t('settings.deleteAccountForGood')}
                            busyLabel={t('settings.deleting')}
                            danger
                            onConfirm={confirmDeleteAccount}
                            onClose={() => setConfirmingDelete(false)}
                        >
                            <p className="confirm-warning">{t('settings.deleteConfirm')}</p>
                        </ConfirmDialog>
                    )}
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
