import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/frontend/hooks/useAuth';
import '@/frontend/css/Auth.css';
import { Logo, AlertCircleIcon } from '@/frontend/svg/Icons';
import { useI18n } from '@/frontend/hooks/useI18n';
import LoginBackdrop from '@/frontend/components/LoginBackdrop';

type Mode = 'login' | 'register' | 'forgot' | 'two-factor';

export default function LoginForm() {
    // Arrived through the home page's hero transition: the scene is already
    // there, so only the card comes in.
    const fromLanding = !!(useLocation().state as { fromLanding?: boolean } | null)?.fromLanding;
    const [mode, setMode] = useState<Mode>(() => (new URLSearchParams(window.location.search).has('signup') ? 'register' : 'login'));
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [forgotSent, setForgotSent] = useState(false);
    const [challengeToken, setChallengeToken] = useState('');
    const [code, setCode] = useState('');
    const [useRecoveryCode, setUseRecoveryCode] = useState(false);

    const { login, register, forgotPassword, completeTwoFactorLogin } = useAuth();
    const { t } = useI18n();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (mode === 'login') {
                const { twoFactorChallenge } = await login(email, password);
                if (twoFactorChallenge) {
                    setChallengeToken(twoFactorChallenge);
                    setCode('');
                    setMode('two-factor');
                }
            } else if (mode === 'two-factor') {
                try {
                    await completeTwoFactorLogin(challengeToken, code);
                } catch (err) {
                    // Took too long: back to the password step.
                    if ((err as { challengeExpired?: boolean }).challengeExpired) {
                        setMode('login');
                        setPassword('');
                    }
                    throw err;
                }
            } else if (mode === 'register') {
                // Validation
                if (password.length < 6) {
                    throw new Error(t('auth.errorPasswordLength'));
                }
                if (username.length < 3) {
                    throw new Error(t('auth.errorUsernameLength'));
                }
                await register(email, password, username);
            } else {
                await forgotPassword(email);
                setForgotSent(true);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : t('auth.failed'));
        } finally {
            setIsLoading(false);
        }
    };

    const switchMode = (next: Mode) => {
        setMode(next);
        setError('');
        setForgotSent(false);
        setUseRecoveryCode(false);
    };

    return (
        <div className="auth-container">
            <LoginBackdrop />
            <div className={`auth-card-wrap${fromLanding ? ' from-landing' : ''}`}>
            <div className="auth-card-glow" aria-hidden="true" />
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
                <div className="action-text">
                    <p>
                        {mode === 'login' && t('auth.signInTitle')}
                        {mode === 'register' && t('auth.registerTitle')}
                        {mode === 'forgot' && t('auth.forgotTitle')}
                        {mode === 'two-factor' && t('auth.twoFactorTitle')}
                    </p>
                </div>

                {mode === 'forgot' && forgotSent ? (
                    <div className="action-text">
                        <p>{t('auth.forgotSent')}</p>
                        <button className="toggle-btn" onClick={() => switchMode('login')}>
                            {t('auth.backToSignIn')}
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="auth-form">
                        {mode === 'two-factor' && (
                            <div className="form-group">
                                <label htmlFor="code">
                                    {useRecoveryCode ? t('auth.recoveryLabel') : t('auth.codeLabel')}
                                </label>
                                <input
                                    id="code"
                                    type="text"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    required
                                    autoFocus
                                    placeholder={useRecoveryCode ? 'xxxxx-xxxxx' : '123456'}
                                    autoComplete="one-time-code"
                                    inputMode={useRecoveryCode ? 'text' : 'numeric'}
                                    pattern={useRecoveryCode ? undefined : '[0-9]{6}'}
                                    maxLength={useRecoveryCode ? 32 : 6}
                                />
                                <button
                                    type="button"
                                    className="toggle-btn forgot-password-link"
                                    onClick={() => { setUseRecoveryCode(v => !v); setCode(''); setError(''); }}
                                >
                                    {useRecoveryCode ? t('auth.useApp') : t('auth.useRecovery')}
                                </button>
                            </div>
                        )}

                        {mode === 'register' && (
                            <div className="form-group">
                                <label htmlFor="username">{t('auth.username')}</label>
                                <input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    required
                                    placeholder="johndoe"
                                    autoComplete="username"
                                    minLength={3}
                                />
                                <span className="field-hint">{t('auth.usernameHint')}</span>
                            </div>
                        )}

                        {mode !== 'two-factor' && (
                        <div className="form-group">
                            <label htmlFor="email">{t('auth.email')}</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                placeholder="you@example.com"
                                autoComplete="email"
                            />
                        </div>
                        )}

                        {(mode === 'login' || mode === 'register') && (
                            <div className="form-group">
                                <label htmlFor="password">{t('auth.password')}</label>
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    placeholder="••••••••"
                                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                    minLength={6}
                                />
                                <span className="field-hint">{t('auth.passwordHint')}</span>
                            </div>
                        )}

                        {mode === 'login' && (
                            <button
                                type="button"
                                className="toggle-btn forgot-password-link"
                                onClick={() => switchMode('forgot')}
                            >
                                {t('auth.forgotLink')}
                            </button>
                        )}

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
                                    {mode === 'login' && t('auth.signingIn')}
                                    {mode === 'register' && t('auth.signingUp')}
                                    {mode === 'forgot' && t('auth.sending')}
                                    {mode === 'two-factor' && t('auth.verifying')}
                                </>
                            ) : (
                                <>
                                    {mode === 'login' && t('auth.signIn')}
                                    {mode === 'register' && t('auth.signUp')}
                                    {mode === 'forgot' && t('auth.sendReset')}
                                    {mode === 'two-factor' && t('auth.verify')}
                                </>
                            )}
                        </button>
                    </form>
                )}

                {mode === 'two-factor' && (
                    <div className="auth-toggle auth-toggle-solo">
                        <button onClick={() => switchMode('login')} className="toggle-btn">
                            {t('auth.backToSignIn')}
                        </button>
                    </div>
                )}

                {(mode === 'login' || mode === 'register') && (
                    <>
                        <div className="auth-divider">
                            <span>{t('auth.or')}</span>
                        </div>

                        <div className="auth-toggle">
                            <p>
                                {mode === 'login' ? t('auth.noAccount') : t('auth.haveAccount')}
                            </p>
                            <button
                                onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                                className="toggle-btn"
                            >
                                {mode === 'login' ? t('auth.createOne') : t('auth.signInInstead')}
                            </button>
                        </div>
                    </>
                )}
            </div>
            </div>
        </div>
    );
}
