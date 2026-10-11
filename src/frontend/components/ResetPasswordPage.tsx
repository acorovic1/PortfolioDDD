import { useState } from 'react';
import { useAuth } from '@/frontend/hooks/useAuth';
import '@/frontend/css/Auth.css';
import { Logo, AlertCircleIcon } from '@/frontend/svg/Icons';
import { useI18n } from '@/frontend/hooks/useI18n';

export default function ResetPasswordPage({ token, onDone }: { token: string; onDone: () => void }) {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const { resetPassword } = useAuth();
    const { t } = useI18n();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword.length < 6) {
            setError(t('auth.errorPasswordLength'));
            return;
        }
        if (newPassword !== confirmPassword) {
            setError(t('auth.errorPasswordsMatch'));
            return;
        }

        setIsLoading(true);
        try {
            await resetPassword(token, newPassword);
            setSuccess(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to reset password');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <div className="auth-logo">
                        <Logo />
                    </div>
                    <h1>PortfolioDDD</h1>
                    <div className="auth-logo">
                        <Logo />
                    </div>
                </div>

                {success ? (
                    <div className="action-text">
                        <p>{t('reset.done')}</p>
                        <button className="toggle-btn" onClick={onDone}>{t('auth.backToSignIn')}</button>
                    </div>
                ) : (
                    <>
                        <div className="action-text">
                            <p>{t('reset.title')}</p>
                        </div>
                        <form onSubmit={handleSubmit} className="auth-form">
                            <div className="form-group">
                                <label htmlFor="newPassword">{t('reset.newPassword')}</label>
                                <input
                                    id="newPassword"
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    autoComplete="new-password"
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="confirmPassword">{t('reset.confirmPassword')}</label>
                                <input
                                    id="confirmPassword"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    autoComplete="new-password"
                                />
                            </div>

                            {error && (
                                <div className="error-message">
                                    <AlertCircleIcon />
                                    {error}
                                </div>
                            )}

                            <button type="submit" className="auth-submit-btn" disabled={isLoading}>
                                {isLoading ? (
                                    <>
                                        <span className="spinner"></span>
                                        {t('reset.submitting')}
                                    </>
                                ) : t('reset.submit')}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}
