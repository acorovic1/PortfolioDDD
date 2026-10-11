import { useState } from 'react';
import { useAuth } from '@/frontend/hooks/useAuth';
import '@/frontend/css/EmailVerifyBanner.css';
import { useI18n } from '@/frontend/hooks/useI18n';

// Reminds signed-in people with an unconfirmed address to confirm it.
export default function EmailVerifyBanner() {
    const { user, resendVerification } = useAuth();
    const { t } = useI18n();
    const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
    const [dismissed, setDismissed] = useState(false);
    const [error, setError] = useState('');

    if (!user || user.emailVerified !== false || dismissed) return null;

    const resend = async () => {
        setState('sending');
        try {
            await resendVerification();
            setState('sent');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send');
            setState('error');
        }
    };

    return (
        <div className="email-verify-banner" role="status">
            <span>
                {t(state === 'sent' ? 'banner.sent' : 'banner.confirm', { email: user.email })}
                {state === 'error' && <span className="email-verify-error"> {error}</span>}
            </span>
            {state !== 'sent' && (
                <button className="email-verify-action" onClick={resend} disabled={state === 'sending'}>
                    {state === 'sending' ? t('auth.sending') : t('banner.resend')}
                </button>
            )}
            <button className="email-verify-close" onClick={() => setDismissed(true)} aria-label={t('banner.dismiss')}>×</button>
        </div>
    );
}
