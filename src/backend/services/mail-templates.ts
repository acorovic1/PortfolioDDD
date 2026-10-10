import { appOrigin, type Mail } from './mail.ts';

// Every email is plain text plus a simple, inline-styled HTML version
// (email clients ignore stylesheets).

const SITE = 'PortfolioDDD';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type Content = {
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  footnote?: string;
};

function layout(to: string, subject: string, content: Content): Mail {
  const { heading, paragraphs, action, footnote } = content;

  const text = [
    heading,
    '',
    ...paragraphs.flatMap(p => [p, '']),
    ...(action ? [`${action.label}: ${action.url}`, ''] : []),
    ...(footnote ? [footnote, ''] : []),
    `- ${SITE}`,
  ].join('\n');

  const button = action
    ? `<p style="margin:28px 0"><a href="${escapeHtml(action.url)}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;display:inline-block">${escapeHtml(action.label)}</a></p>
       <p style="font-size:12px;color:#6b7280;word-break:break-all">Or paste this link into your browser:<br>${escapeHtml(action.url)}</p>`
    : '';

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:10px;padding:32px">
      <tr><td>
        <p style="margin:0 0 24px;font-weight:700;font-size:16px">${SITE}</p>
        <h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(heading)}</h1>
        ${paragraphs.map(p => `<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(p)}</p>`).join('\n        ')}
        ${button}
        ${footnote ? `<p style="margin:24px 0 0;font-size:12px;color:#6b7280">${escapeHtml(footnote)}</p>` : ''}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  return { to, subject, text, html };
}

export function verifyEmailMail(to: string, username: string, token: string): Mail {
  return layout(to, `Confirm your email for ${SITE}`, {
    heading: 'Confirm your email address',
    paragraphs: [`Hi @${username}, please confirm that this is your email address.`],
    action: { label: 'Confirm email', url: `${appOrigin()}/verify-email?token=${token}` },
    footnote: "This link expires in 24 hours. If you didn't create an account, you can ignore this email.",
  });
}

export function passwordResetMail(to: string, username: string, token: string): Mail {
  return layout(to, `Reset your ${SITE} password`, {
    heading: 'Reset your password',
    paragraphs: [`Hi @${username}, someone (hopefully you) asked to reset your password.`],
    action: { label: 'Choose a new password', url: `${appOrigin()}/reset-password?token=${token}` },
    footnote: "This link expires in 1 hour. If you didn't ask for this, you can ignore this email - your password won't change.",
  });
}

export function passwordChangedMail(to: string, username: string): Mail {
  return layout(to, `Your ${SITE} password was changed`, {
    heading: 'Your password was changed',
    paragraphs: [
      `Hi @${username}, the password for your account was just changed and every other session was signed out.`,
      "If this wasn't you, reset your password right away.",
    ],
    action: { label: 'Reset password', url: `${appOrigin()}/login` },
  });
}

export function emailChangedMail(to: string, username: string, newEmail: string): Mail {
  return layout(to, `Your ${SITE} email was changed`, {
    heading: 'Your email address was changed',
    paragraphs: [
      `Hi @${username}, the email address on your account was changed to ${newEmail}.`,
      "If this wasn't you, contact us and reset your password.",
    ],
  });
}

export function twoFactorChangedMail(to: string, username: string, enabled: boolean): Mail {
  return layout(to, `Two-factor authentication ${enabled ? 'enabled' : 'disabled'}`, {
    heading: `Two-factor authentication is ${enabled ? 'on' : 'off'}`,
    paragraphs: [
      enabled
        ? `Hi @${username}, signing in to your account now also needs a code from your authenticator app.`
        : `Hi @${username}, two-factor authentication was turned off for your account.`,
      "If this wasn't you, reset your password right away.",
    ],
  });
}

export type DigestItem = { message: string; createdAt: string };

export function notificationDigestMail(to: string, username: string, items: DigestItem[], total: number): Mail {
  const more = total - items.length;
  return layout(to, total === 1 ? items[0].message : `You have ${total} new notifications on ${SITE}`, {
    heading: total === 1 ? 'You have a new notification' : `You have ${total} new notifications`,
    paragraphs: [
      `Hi @${username}, here's what you missed:`,
      ...items.map(item => `• ${item.message}`),
      ...(more > 0 ? [`…and ${more} more.`] : []),
    ],
    action: { label: `Open ${SITE}`, url: `${appOrigin()}/portfolio` },
    footnote: `You can turn these emails off in Settings: ${appOrigin()}/settings`,
  });
}
