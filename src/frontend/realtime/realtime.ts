import { useEffect, useRef } from 'react';
import { API_BASE_URL } from '@/frontend/config/api';

// One shared Server-Sent Events connection (GET /api/events) for the signed-in
// user. Read with fetch rather than EventSource so the token goes in the
// Authorization header, not the URL. Reconnects with backoff.

export type RealtimeEventName = 'notification' | 'message';
type Handler = (data: Record<string, unknown>) => void;

const handlers = new Map<string, Set<Handler>>();
let current: { token: string; controller: AbortController } | null = null;

function dispatch(event: string, data: Record<string, unknown>): void {
  handlers.get(event)?.forEach(handler => handler(data));
}

async function run(token: string, controller: AbortController): Promise<void> {
  let delay = 1000;
  while (!controller.signal.aborted) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/events`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      // A rejected token won't get better by retrying.
      if (res.status === 401 || res.status === 403) return;
      if (!res.ok || !res.body) throw new Error(`Event stream failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
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
          if (!event) continue; // heartbeat comment
          if (event === 'ready') {
            delay = 1000;
            // Anything may have changed while disconnected - let listeners resync.
            dispatch('notification', {});
            dispatch('message', {});
            continue;
          }
          try {
            dispatch(event, data ? JSON.parse(data) : {});
          } catch {
            dispatch(event, {});
          }
        }
      }
    } catch {
      if (controller.signal.aborted) return;
    }
    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, 30_000);
  }
}

// Opens the stream for `token` (closing any previous one); null disconnects.
export function connectRealtime(token: string | null): void {
  if (current?.token === token) return;
  current?.controller.abort();
  current = null;
  if (!token) return;
  const controller = new AbortController();
  current = { token, controller };
  void run(token, controller);
}

// Calls `handler` on every `event`. The latest handler is always used, so
// callers don't need to memoize it.
export function useRealtimeEvent(event: RealtimeEventName, handler: Handler): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const wrapped: Handler = (data) => ref.current(data);
    let set = handlers.get(event);
    if (!set) {
      set = new Set();
      handlers.set(event, set);
    }
    set.add(wrapped);
    return () => {
      set!.delete(wrapped);
    };
  }, [event]);
}

// Keeps the shared connection in sync with the signed-in user.
export function useRealtimeConnection(token: string | null): void {
  useEffect(() => {
    connectRealtime(token);
  }, [token]);
}
