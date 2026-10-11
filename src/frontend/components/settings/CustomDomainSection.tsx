import { useEffect, useState } from 'react';
import { apiFetch } from '@/frontend/utils/api';
import { useAuth } from '@/frontend/hooks/useAuth';
import { useI18n } from '@/frontend/hooks/useI18n';

type DomainStatus =
  | { domain: null }
  | {
      domain: string;
      verified: boolean;
      verifiedAt: string | null;
      txtRecord: { name: string; value: string };
      target: string;
    };

function CopyValue({ value }: { value: string }) {
    const { t } = useI18n();
    const [copied, setCopied] = useState(false);
    return (
        <span className="domain-value">
            <code>{value}</code>
            <button
                type="button"
                className="settings-link-btn"
                onClick={() => navigator.clipboard.writeText(value).then(() => setCopied(true))}
            >
                {t(copied ? 'common.copied' : 'common.copy')}
            </button>
        </span>
    );
}

// Connect an own domain (portfolio.example.com) that shows this profile.
export default function CustomDomainSection() {
    const { token } = useAuth();
    const { t } = useI18n();
    const [status, setStatus] = useState<DomainStatus | null>(null);
    const [input, setInput] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!token) return;
        apiFetch<DomainStatus>('/api/users/me/domain', { token })
            .then(setStatus)
            .catch(err => setError(String(err instanceof Error ? err.message : err)));
    }, [token]);

    const run = async (request: () => Promise<DomainStatus>) => {
        setError('');
        setBusy(true);
        try {
            setStatus(await request());
        } catch (err) {
            setError(err instanceof Error ? err.message : t('security.error'));
        } finally {
            setBusy(false);
        }
    };

    const save = (e: React.FormEvent) => {
        e.preventDefault();
        run(() => apiFetch<DomainStatus>('/api/users/me/domain', { method: 'PUT', token, body: { domain: input } }));
    };

    return (
        <section className="settings-section">
            <h3 className="settings-section-title">{t('domain.title')}</h3>

            {!status ? (
                <p className="settings-section-description">{t('common.loading')}</p>
            ) : status.domain === null ? (
                <>
                    <p className="settings-section-description">
                        {t('domain.intro')}
                    </p>
                    <form className="settings-form" onSubmit={save}>
                        <input
                            className="settings-input"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="portfolio.yourname.com"
                        />
                        <button type="submit" className="settings-save-btn" disabled={busy || !input.trim()}>
                            {t('domain.connect')}
                        </button>
                    </form>
                </>
            ) : (
                <>
                    <p className="settings-section-description">
                        <strong className="domain-name">{status.domain}</strong>
                        {status.verified
                            ? <span className="security-badge on">{t('domain.live')}</span>
                            : <span className="security-badge pending">{t('domain.pending')}</span>}
                    </p>

                    {status.verified ? (
                        <p className="settings-section-description">
                            {t('domain.liveHint').split('{url}').map((part, i) => (
                                <span key={i}>
                                    {i > 0 && <a href={`https://${status.domain}`}>https://{status.domain}</a>}
                                    {part}
                                </span>
                            ))}
                        </p>
                    ) : (
                        <p className="settings-section-description">
                            {t('domain.instructions')}
                        </p>
                    )}

                    <dl className="domain-records">
                        <dt>CNAME</dt>
                        <dd>
                            <span className="domain-record-label">{t('domain.name')}</span><CopyValue value={status.domain} />
                            <span className="domain-record-label">{t('domain.pointsTo')}</span><CopyValue value={status.target} />
                        </dd>
                        <dt>TXT</dt>
                        <dd>
                            <span className="domain-record-label">{t('domain.name')}</span><CopyValue value={status.txtRecord.name} />
                            <span className="domain-record-label">{t('domain.value')}</span><CopyValue value={status.txtRecord.value} />
                        </dd>
                    </dl>

                    <div className="settings-form-row">
                        {!status.verified && (
                            <button
                                type="button"
                                className="settings-save-btn"
                                disabled={busy}
                                onClick={() => run(() => apiFetch<DomainStatus>('/api/users/me/domain/verify', { method: 'POST', token }))}
                            >
                                {t(busy ? 'domain.checking' : 'domain.check')}
                            </button>
                        )}
                        <button
                            type="button"
                            className="settings-delete-btn"
                            disabled={busy}
                            onClick={() => {
                                setInput('');
                                run(() => apiFetch<DomainStatus>('/api/users/me/domain', { method: 'DELETE', token }));
                            }}
                        >
                            {t('domain.disconnect')}
                        </button>
                    </div>
                </>
            )}
            {error && <span className="settings-error-hint">{error}</span>}
        </section>
    );
}
