import { useState } from 'react';
import { useAuth } from '@/frontend/hooks/useAuth';
import '@/frontend/css/Auth.css';
import { Logo, AlertCircleIcon } from '@/frontend/svg/Icons';

type Mode = 'login' | 'register' | 'forgot';

export default function LoginForm() {
    const [mode, setMode] = useState<Mode>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [forgotSent, setForgotSent] = useState(false);

    const { login, register, forgotPassword } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (mode === 'login') {
                await login(email, password);
            } else if (mode === 'register') {
                // Validation
                if (password.length < 6) {
                    throw new Error('Password must be at least 6 characters');
                }
                if (username.length < 3) {
                    throw new Error('Username must be at least 3 characters');
                }
                await register(email, password, username);
            } else {
                await forgotPassword(email);
                setForgotSent(true);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Authentication failed');
        } finally {
            setIsLoading(false);
        }
    };

    const switchMode = (next: Mode) => {
        setMode(next);
        setError('');
        setForgotSent(false);
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
                <div className="action-text">
                    <p>
                        {mode === 'login' && 'Sign in to your account'}
                        {mode === 'register' && 'Create your account'}
                        {mode === 'forgot' && 'Reset your password'}
                    </p>
                </div>

                {mode === 'forgot' && forgotSent ? (
                    <div className="action-text">
                        <p>If an account exists for that email, a reset link has been sent.</p>
                        <button className="toggle-btn" onClick={() => switchMode('login')}>
                            Back to sign in
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="auth-form">
                        {mode === 'register' && (
                            <div className="form-group">
                                <label htmlFor="username">Username</label>
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
                                <span className="field-hint">At least 3 characters</span>
                            </div>
                        )}

                        <div className="form-group">
                            <label htmlFor="email">Email</label>
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

                        {mode !== 'forgot' && (
                            <div className="form-group">
                                <label htmlFor="password">Password</label>
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
                                <span className="field-hint">At least 6 characters</span>
                            </div>
                        )}

                        {mode === 'login' && (
                            <button
                                type="button"
                                className="toggle-btn forgot-password-link"
                                onClick={() => switchMode('forgot')}
                            >
                                Forgot password?
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
                                    {mode === 'login' && 'Signing in...'}
                                    {mode === 'register' && 'Creating account...'}
                                    {mode === 'forgot' && 'Sending...'}
                                </>
                            ) : (
                                <>
                                    {mode === 'login' && 'Sign In'}
                                    {mode === 'register' && 'Sign Up'}
                                    {mode === 'forgot' && 'Send reset link'}
                                </>
                            )}
                        </button>
                    </form>
                )}

                {mode !== 'forgot' && (
                    <>
                        <div className="auth-divider">
                            <span>or</span>
                        </div>

                        <div className="auth-toggle">
                            <p>
                                {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
                            </p>
                            <button
                                onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                                className="toggle-btn"
                            >
                                {mode === 'login' ? 'Create one now' : 'Sign in instead'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
