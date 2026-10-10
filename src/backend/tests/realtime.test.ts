import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../app.ts';
import { registerTestUser, deleteTestUsers } from './helpers.ts';
import { stopRealtime } from '../services/realtime.ts';

const createdUserIds: string[] = [];
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await stopRealtime();
  server.close();
  await deleteTestUsers(createdUserIds);
});

// Opens the user's event stream and collects named events.
async function openStream(token: string) {
  const controller = new AbortController();
  const res = await fetch(`${baseUrl}/api/events`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
  const events: { event: string; data: unknown }[] = [];
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const event = /^event: (.+)$/m.exec(frame)?.[1];
          const data = /^data: (.+)$/m.exec(frame)?.[1];
          if (event) events.push({ event, data: data ? JSON.parse(data) : null });
        }
      }
    } catch {
      // aborted
    }
  })();
  const waitFor = async (event: string, count = 1) => {
    for (let i = 0; i < 50; i++) {
      if (events.filter(e => e.event === event).length >= count) return;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error(`Timed out waiting for ${event}`);
  };
  return { res, events, waitFor, close: () => controller.abort() };
}

describe('realtime events', () => {
  it('rejects unauthenticated streams', async () => {
    expect((await fetch(`${baseUrl}/api/events`)).status).toBe(401);
  });

  it('pushes new messages and notifications to the right user', async () => {
    const alice = await registerTestUser();
    const bob = await registerTestUser();
    createdUserIds.push(alice.id, bob.id);

    const stream = await openStream(bob.token);
    expect(stream.res.headers.get('content-type')).toContain('text/event-stream');
    await stream.waitFor('ready');
    const aliceStream = await openStream(alice.token);
    await aliceStream.waitFor('ready');

    await request(app).post(`/api/messages/${bob.username}`).set('Authorization', `Bearer ${alice.token}`).send({ body: 'hi' });
    await stream.waitFor('message');
    await stream.waitFor('notification');
    // The sender's other tabs hear about it too, but get no notification.
    await aliceStream.waitFor('message');

    await request(app).post(`/api/users/${bob.username}/follow`).set('Authorization', `Bearer ${alice.token}`);
    await stream.waitFor('notification', 2);
    expect(stream.events.filter(e => e.event === 'notification').map(e => e.data)).toEqual([{ type: 'message' }, { type: 'follow' }]);
    expect(aliceStream.events.some(e => e.event === 'notification')).toBe(false);

    stream.close();
    aliceStream.close();
  });
});
