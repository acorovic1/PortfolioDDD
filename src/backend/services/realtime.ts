import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '../config/db.ts';
import type { AuthRequest } from '../types.ts';

// Real-time push over Server-Sent Events. Events are small "something changed"
// signals (the client refetches what it needs). They're fanned out through
// Postgres LISTEN/NOTIFY, so every server instance delivers to its own
// connected clients - no extra infrastructure needed to run several.

export type RealtimeEvent = 'notification' | 'message';

const CHANNEL = 'realtime_events';
const HEARTBEAT_MS = 25_000;

const clients = new Map<string, Set<Response>>();

let listener: PoolClient | null = null;
let listening: Promise<void> | null = null;

function deliver(userId: string, event: RealtimeEvent, data: unknown): void {
  const connections = clients.get(userId);
  if (!connections) return;
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  connections.forEach(res => res.write(frame));
}

// One dedicated connection per process LISTENs for events from every
// instance (including this one). Started on the first subscriber.
function ensureListener(): Promise<void> {
  if (!listening) {
    listening = (async () => {
      const client = await pool.connect();
      client.on('notification', (msg) => {
        if (msg.channel !== CHANNEL || !msg.payload) return;
        try {
          const { userId, event, data } = JSON.parse(msg.payload);
          deliver(userId, event, data);
        } catch {
          // Ignore malformed payloads.
        }
      });
      client.on('error', (err) => {
        console.error('Realtime listener lost its connection:', err.message);
        client.release(true);
        listener = null;
        listening = null;
        // Reconnect if anyone is still connected.
        if (clients.size > 0) setTimeout(() => void ensureListener().catch(() => {}), 2000);
      });
      await client.query(`LISTEN ${CHANNEL}`);
      listener = client;
    })().catch(err => {
      listening = null;
      throw err;
    });
  }
  return listening;
}

// Sends `event` to every open connection of `userId`, on any instance.
// Never throws - real-time delivery is best-effort (clients also resync).
export function publish(userId: string, event: RealtimeEvent, data: Record<string, unknown> = {}): void {
  pool.query('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify({ userId, event, data })])
    .catch(err => console.error('Failed to publish realtime event:', err.message));
}

// GET /api/events - the authenticated user's event stream.
export async function eventStream(req: Request, res: Response): Promise<void> {
  const userId = (req as AuthRequest).user!.id;
  await ensureListener();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Don't let nginx-style proxies buffer the stream.
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n\n');
  res.write('event: ready\ndata: {}\n\n');

  let connections = clients.get(userId);
  if (!connections) {
    connections = new Set();
    clients.set(userId, connections);
  }
  connections.add(res);

  // Comments keep idle connections from being closed by proxies.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    connections!.delete(res);
    if (connections!.size === 0) clients.delete(userId);
  });
}

// For tests: drops the LISTEN connection.
export async function stopRealtime(): Promise<void> {
  listener?.release();
  listener = null;
  listening = null;
}
