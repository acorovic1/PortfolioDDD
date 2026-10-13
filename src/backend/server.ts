import { app, scheduleReconnect } from './app.ts';
import { mailConfigured } from './services/mail.ts';

const port = Number(process.env.PORT) || 3001;

// Express 5 hands listen errors (e.g. the port is taken) to this callback
// instead of throwing - without the check the process would quietly exit.
app.listen(port, (error?: Error) => {
  if (error) {
    console.error(`Could not start the server on port ${port}:`, error.message);
    process.exit(1);
  }
  console.log(`Server is running on http://localhost:${port}`);
  if (!mailConfigured()) {
    console.warn('[mail] SMTP is not configured (SMTP_URL or SMTP_HOST) - emails are printed here instead of sent.');
  }
  scheduleReconnect();
});
