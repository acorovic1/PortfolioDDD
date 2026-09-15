import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../css/Auth.css';
import Logo from './Logo';

export default function LoginForm() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const { login, register } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (isLogin) {
                await login(email, password);
            } else {
                // Validation
                if (password.length < 6) {
                    throw new Error('Password must be at least 6 characters');
                }
                if (username.length < 3) {
                    throw new Error('Username must be at least 3 characters');
                }
                await register(email, password, name, username);
            }
        } catch (err: any) {
            setError(err.message || 'Authentication failed');
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
                <div className="action-text">
                    <p>{isLogin ? 'Sign in to your account' : 'Create your account'}</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {!isLogin && (
                        <>
                            <div className="form-group">
                                <label htmlFor="name">Full Name</label>
                                <input
                                    id="name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    placeholder="John Doe"
                                    autoComplete="name"
                                />
                            </div>

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
                        </>
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

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            placeholder="••••••••"
                            autoComplete={isLogin ? 'current-password' : 'new-password'}
                            minLength={6}
                        />
                        <span className="field-hint">At least 6 characters</span>
                    </div>

                    {error && (
                        <div className="error-message">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <button type="submit" className="auth-submit-btn" disabled={isLoading}>
                        {isLoading ? (
                            <>
                                <span className="spinner"></span>
                                {isLogin ? 'Signing in...' : 'Creating account...'}
                            </>
                        ) : (
                            isLogin ? 'Sign In' : 'Sign Up'
                        )}
                    </button>
                </form>

                <div className="auth-divider">
                    <span>or</span>
                </div>

                <div className="auth-toggle">
                    <p>
                        {isLogin ? "Don't have an account?" : 'Already have an account?'}
                    </p>
                    <button onClick={() => {
                        setIsLogin(!isLogin);
                        setError('');
                    }} className="toggle-btn">
                        {isLogin ? 'Create one now' : 'Sign in instead'}
                    </button>
                </div>
            </div>
        </div>
    );
}