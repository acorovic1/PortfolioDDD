import nodemailer, { type Transporter } from 'nodemailer';

// Outgoing email. Configure SMTP with SMTP_URL (smtp://user:pass@host:587)
// or SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD/SMTP_SECURE; MAIL_FROM is
// the sender. Without SMTP, mail is printed to the console instead (dev) and
// kept in `outbox` (tests).

export type Mail = { to: string; subject: string; text: string; html: string };

export const outbox: Mail[] = [];
const OUTBOX_LIMIT = 200;

let transport: Transporter | null | undefined;

function getTransport(): Transporter | null {
  if (transport !== undefined) return transport;

  if (process.env.SMTP_URL) {
    transport = nodemailer.createTransport(process.env.SMTP_URL);
  } else if (process.env.SMTP_HOST) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? '' }
        : undefined,
    });
  } else {
    transport = null;
  }
  return transport;
}

// For tests that change the env.
export function resetMailTransport(): void {
  transport = undefined;
}

export function mailConfigured(): boolean {
  return getTransport() !== null;
}

// Where links in emails point: the public site, or the dev frontend.
export function appOrigin(): string {
  const configured = process.env.PUBLIC_URL || process.env.CORS_ORIGIN?.split(',')[0];
  return (configured?.trim() || 'http://localhost:5173').replace(/\/+$/, '');
}

export async function sendMail(mail: Mail): Promise<void> {
  const smtp = getTransport();
  if (!smtp) {
    outbox.push(mail);
    if (outbox.length > OUTBOX_LIMIT) outbox.shift();
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[mail] (SMTP not configured) to ${mail.to}: ${mail.subject}\n${mail.text}\n`);
    }
    return;
  }

  await smtp.sendMail({
    from: process.env.MAIL_FROM || 'PortfolioDDD <no-reply@localhost>',
    ...mail,
  });
}

// Requests never wait on (or fail because of) the mail server.
export function sendMailInBackground(mail: Mail): void {
  sendMail(mail).catch(err => console.error(`Failed to send "${mail.subject}" to ${mail.to}:`, err));
}
