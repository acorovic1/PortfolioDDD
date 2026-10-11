import { useEffect, useState } from 'react';
import { apiFetch } from '@/frontend/utils/api';
import { useAuth } from '@/frontend/hooks/useAuth';
import { useI18n } from '@/frontend/hooks/useI18n';

type Status = { enabled: boolean; enabledAt: string | null; recoveryCodesLeft: number };
type Setup = { secret: string; otpauthUrl: string; qrCode: string };

function errorText(err: unknown, fallback: string): string {
    return err instanceof Error ? err.message : fallback;
}

// Shown once, right after they're generated.
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
    const { t } = useI18n();
    const text = codes.join('\n');
    const [copied, setCopied] = useState(false);

    const download = () => {
        const url = URL.createObjectURL(new Blob([`PortfolioDDD recovery codes\n\n${text}\n`], { type: 'text/plain' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'portfolioddd-recovery-codes.txt';
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="security-recovery">
            <p className="settings-section-description">
                {t('security.recoveryIntro')}
            </p>
            <ol className="security-recovery-codes">
                {codes.map(code => <li key={code}><code>{code}</code></li>)}
            </ol>
            <div className="settings-form-row">
                <button
                    type="button"
                    className="settings-save-btn"
                    onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
                >
                    {t(copied ? 'common.copied' : 'common.copy')}
                </button>
                <button type="button" className="settings-save-btn" onClick={download}>{t('security.download')}</button>
                <button type="button" className="settings-save-btn" onClick={onDone}>{t('security.savedThem')}</button>
            </div>
        </div>
    );
}

export default function SecuritySection() {
    const { token, replaceSessionToken, refreshUser, logoutEverywhere } = useAuth();
    const { t, tp } = useI18n();
    const [status, setStatus] = useState<Status | null>(null);
    const [setup, setSetup] = useState<Setup | null>(null);
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
    const [panel, setPanel] = useState<'none' | 'disable' | 'regenerate'>('none');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [signedOutOthers, setSignedOutOthers] = useState(false);

    const loadStatus = () => apiFetch<Status>('/api/auth/2fa', { token })
        .then(setStatus)
        .catch(err => setError(errorText(err, t('security.error'))));

    useEffect(() => {
        if (!token) return;
        loadStatus();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once per session
    }, []);

    const run = async (action: () => Promise<void>) => {
        setError('');
        setBusy(true);
        try {
            await action();
        } catch (err) {
            setError(errorText(err, t('security.error')));
        } finally {
            setBusy(false);
        }
    };

    const startSetup = () => run(async () => {
        setSetup(await apiFetch<Setup>('/api/auth/2fa/setup', { method: 'POST', token }));
        setCode('');
    });

    const confirmSetup = (e: React.FormEvent) => {
        e.preventDefault();
        run(async () => {
            const result = await apiFetch<{ recoveryCodes: string[]; token: string }>('/api/auth/2fa/enable', {
                method: 'POST', token, body: { code },
            });
            setSetup(null);
            setRecoveryCodes(result.recoveryCodes);
            setStatus({ enabled: true, enabledAt: new Date().toISOString(), recoveryCodesLeft: result.recoveryCodes.length });
            // Other sessions were signed out; this one gets a new token.
            await replaceSessionToken(result.token);
        });
    };

    const disable = (e: React.FormEvent) => {
        e.preventDefault();
        run(async () => {
            await apiFetch('/api/auth/2fa/disable', { method: 'POST', token, body: { password, code } });
            setPanel('none');
            setPassword('');
            setCode('');
            setStatus({ enabled: false, enabledAt: null, recoveryCodesLeft: 0 });
            await refreshUser();
        });
    };

    const regenerate = (e: React.FormEvent) => {
        e.preventDefault();
        run(async () => {
            const result = await apiFetch<{ recoveryCodes: string[] }>('/api/auth/2fa/recovery-codes', {
                method: 'POST', token, body: { password },
            });
            setPanel('none');
            setPassword('');
            setRecoveryCodes(result.recoveryCodes);
            setStatus(prev => prev && { ...prev, recoveryCodesLeft: result.recoveryCodes.length });
        });
    };

    const signOutOthers = () => run(async () => {
        await logoutEverywhere();
        setSignedOutOthers(true);
    });

    return (
        <>
            <section className="settings-section">
                <h3 className="settings-section-title">{t('security.title')}</h3>

                {recoveryCodes ? (
                    <RecoveryCodes codes={recoveryCodes} onDone={() => setRecoveryCodes(null)} />
                ) : !status ? (
                    <p className="settings-section-description">{t('common.loading')}</p>
                ) : status.enabled ? (
                    <>
                        <p className="settings-section-description">
                            <span className="security-badge on">{t('security.on')}</span>
                            {t('security.onHint')}
                            {' '}{tp('security.codesLeft', status.recoveryCodesLeft)}
                        </p>
                        {panel === 'none' && (
                            <div className="settings-form-row">
                                <button type="button" className="settings-save-btn" onClick={() => setPanel('regenerate')}>
                                    {t('security.newCodes')}
                                </button>
                                <button type="button" className="settings-delete-btn" onClick={() => setPanel('disable')}>
                                    {t('security.turnOff')}
                                </button>
                            </div>
                        )}
                        {panel === 'disable' && (
                            <form className="settings-form settings-form-column" onSubmit={disable}>
                                <input
                                    type="password"
                                    className="settings-input"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder={t('security.yourPassword')}
                                    autoComplete="current-password"
                                    required
                                />
                                <input
                                    className="settings-input"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    placeholder={t('security.codeOrRecovery')}
                                    autoComplete="one-time-code"
                                    required
                                />
                                <div className="settings-form-row">
                                    <button type="submit" className="settings-delete-btn" disabled={busy}>{t('security.turnOffConfirm')}</button>
                                    <button type="button" className="settings-save-btn" onClick={() => setPanel('none')}>{t('common.cancel')}</button>
                                </div>
                            </form>
                        )}
                        {panel === 'regenerate' && (
                            <form className="settings-form" onSubmit={regenerate}>
                                <input
                                    type="password"
                                    className="settings-input"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder={t('security.yourPassword')}
                                    autoComplete="current-password"
                                    required
                                />
                                <button type="submit" className="settings-save-btn" disabled={busy}>{t('security.generate')}</button>
                                <button type="button" className="settings-save-btn" onClick={() => setPanel('none')}>{t('common.cancel')}</button>
                            </form>
                        )}
                    </>
                ) : setup ? (
                    <form className="security-setup" onSubmit={confirmSetup}>
                        <img src={setup.qrCode} alt={t('security.qrAlt')} width={180} height={180} />
                        <div className="security-setup-steps">
                            <p className="settings-section-description">
                                {t('security.step1')}
                            </p>
                            <code className="security-secret">{setup.secret.match(/.{1,4}/g)?.join(' ')}</code>
                            <p className="settings-section-description">{t('security.step2')}</p>
                            <div className="settings-form-row">
                                <input
                                    className="settings-input security-code-input"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="123456"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    autoFocus
                                />
                                <button type="submit" className="settings-save-btn" disabled={busy || code.length !== 6}>
                                    {t('security.turnOn')}
                                </button>
                                <button type="button" className="settings-save-btn" onClick={() => setSetup(null)}>{t('common.cancel')}</button>
                            </div>
                        </div>
                    </form>
                ) : (
                    <>
                        <p className="settings-section-description">
                            {t('security.intro')}
                        </p>
                        <button type="button" className="settings-save-btn" onClick={startSetup} disabled={busy}>
                            {t('security.setUp')}
                        </button>
                    </>
                )}
                {error && <span className="settings-error-hint">{error}</span>}
            </section>

            <section className="settings-section">
                <h3 className="settings-section-title">{t('security.sessions')}</h3>
                <p className="settings-section-description">
                    {t('security.sessionsHint')}
                </p>
                <div className="settings-form-row">
                    <button type="button" className="settings-save-btn" onClick={signOutOthers} disabled={busy}>
                        {t('security.signOutOthers')}
                    </button>
                    {signedOutOthers && <span className="settings-saved-hint">{t('security.done')}</span>}
                </div>
            </section>
        </>
    );
}
