import { useEffect, useState } from 'react';
import { apiFetch } from '@/frontend/utils/api';
import { useAuth } from '@/frontend/hooks/useAuth';

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
    const [copied, setCopied] = useState(false);
    return (
        <span className="domain-value">
            <code>{value}</code>
            <button
                type="button"
                className="settings-link-btn"
                onClick={() => navigator.clipboard.writeText(value).then(() => setCopied(true))}
            >
                {copied ? 'Copied' : 'Copy'}
            </button>
        </span>
    );
}

// Connect an own domain (portfolio.example.com) that shows this profile.
export default function CustomDomainSection() {
    const { token } = useAuth();
    const [status, setStatus] = useState<DomainStatus | null>(null);
    const [input, setInput] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!token) return;
        apiFetch<DomainStatus>('/api/users/me/domain', { token })
            .then(setStatus)
            .catch(err => setError(err instanceof Error ? err.message : 'Failed to load your domain'));
    }, [token]);

    const run = async (request: () => Promise<DomainStatus>) => {
        setError('');
        setBusy(true);
        try {
            setStatus(await request());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
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
            <h3 className="settings-section-title">Custom domain</h3>

            {!status ? (
                <p className="settings-section-description">Loading...</p>
            ) : status.domain === null ? (
                <>
                    <p className="settings-section-description">
                        Show your portfolio on your own domain, like portfolio.yourname.com.
                    </p>
                    <form className="settings-form" onSubmit={save}>
                        <input
                            className="settings-input"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="portfolio.yourname.com"
                        />
                        <button type="submit" className="settings-save-btn" disabled={busy || !input.trim()}>
                            Connect
                        </button>
                    </form>
                </>
            ) : (
                <>
                    <p className="settings-section-description">
                        <strong className="domain-name">{status.domain}</strong>
                        {status.verified
                            ? <span className="security-badge on">Live</span>
                            : <span className="security-badge pending">Waiting for DNS</span>}
                    </p>

                    {status.verified ? (
                        <p className="settings-section-description">
                            Your profile is served at <a href={`https://${status.domain}`}>https://{status.domain}</a>.
                            Keep the DNS records below in place.
                        </p>
                    ) : (
                        <p className="settings-section-description">
                            Add these two records at your domain's DNS provider, then check them here:
                        </p>
                    )}

                    <dl className="domain-records">
                        <dt>CNAME</dt>
                        <dd>
                            <span className="domain-record-label">Name</span><CopyValue value={status.domain} />
                            <span className="domain-record-label">Points to</span><CopyValue value={status.target} />
                        </dd>
                        <dt>TXT</dt>
                        <dd>
                            <span className="domain-record-label">Name</span><CopyValue value={status.txtRecord.name} />
                            <span className="domain-record-label">Value</span><CopyValue value={status.txtRecord.value} />
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
                                {busy ? 'Checking...' : 'Check DNS'}
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
                            Disconnect
                        </button>
                    </div>
                </>
            )}
            {error && <span className="settings-error-hint">{error}</span>}
        </section>
    );
}
