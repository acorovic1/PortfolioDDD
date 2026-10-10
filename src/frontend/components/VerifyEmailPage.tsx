import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/frontend/hooks/useAuth';
import '@/frontend/css/Auth.css';
import { Logo, AlertCircleIcon } from '@/frontend/svg/Icons';

// Landing page for the link in the confirmation email (/verify-email?token=).
export default function VerifyEmailPage({ token, onDone }: { token: string; onDone: () => void }) {
    const { verifyEmail } = useAuth();
    const [state, setState] = useState<'working' | 'done' | 'error'>('working');
    const [error, setError] = useState('');
    // The token is single-use: StrictMode's double effect run must not spend it twice.
    const startedRef = useRef(false);

    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        verifyEmail(token)
            .then(() => setState('done'))
            .catch(err => {
                setError(err instanceof Error ? err.message : 'Failed to confirm email');
                setState('error');
            });
    }, [token, verifyEmail]);

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <div className="auth-logo"><Logo /></div>
                    <h1>PortfolioDDD</h1>
                    <div className="auth-logo"><Logo /></div>
                </div>

                <div className="action-text">
                    {state === 'working' && <p><span className="spinner"></span> Confirming your email...</p>}
                    {state === 'done' && <p>Your email address is confirmed. Thanks!</p>}
                    {state === 'error' && (
                        <div className="error-message">
                            <AlertCircleIcon />
                            {error}
                        </div>
                    )}
                    {state !== 'working' && (
                        <button className="toggle-btn" onClick={onDone}>Continue</button>
                    )}
                </div>
            </div>
        </div>
    );
}
