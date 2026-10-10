import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/frontend/hooks/useAuth';
import { apiFetch, assetUrl } from '@/frontend/utils/api';
import { SendIcon, BriefcaseIcon } from '@/frontend/svg/Icons';
import '@/frontend/css/Community.css';
import '@/frontend/css/Messages.css';
import { useRealtimeEvent } from '@/frontend/realtime/realtime';

type Conversation = {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  lastMessage: { body: string; kind: 'message' | 'hire'; createdAt: string; fromMe: boolean };
  unread: number;
};

type Message = {
  id: string;
  body: string;
  kind: 'message' | 'hire';
  meta: { projectTitle?: string; workType?: string; budget?: string; timeline?: string } | null;
  createdAt: string;
  fromMe: boolean;
};

type Thread = {
  user: { username: string; name: string; avatarUrl: string | null; title: string | null };
  canMessage: boolean;
  messages: Message[];
};

// New messages arrive over the realtime stream; this slow poll is only a
// safety net if the stream is down.
const FALLBACK_POLL_MS = 60_000;
const MESSAGES_READ_EVENT = 'messages-read';

function Avatar({ username, url }: { username: string; url: string | null }) {
  return url
    ? <img className="msg-avatar" src={assetUrl(url)!} alt="" />
    : <span className="msg-avatar artwork-card-avatar">{username.charAt(0).toUpperCase()}</span>;
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type MessagesPageProps = {
  onOpenUser: (username: string) => void;
};

// Inbox + conversation view. `?with=username` opens (or starts) a thread.
// New messages are pushed over the realtime event stream.
export default function MessagesPage({ onOpenUser }: MessagesPageProps) {
  const { token } = useAuth();
  const [params, setParams] = useSearchParams();
  const active = params.get('with');

  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [threadError, setThreadError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const reloadThreadRef = useRef<(() => void) | null>(null);

  const loadConversations = useCallback(() => {
    apiFetch<{ conversations: Conversation[] }>('/api/messages', { token })
      .then(data => setConversations(data.conversations))
      .catch(err => console.error('Failed to load conversations:', err));
  }, [token]);

  useEffect(() => {
    loadConversations();
    const timer = setInterval(loadConversations, FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [loadConversations]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let seenMessages = -1;
    setThread(null);
    setThreadError('');

    const load = () => apiFetch<Thread>(`/api/messages/${encodeURIComponent(active)}`, { token })
      .then(data => {
        if (cancelled) return;
        setThread(prev => {
          // Keep scroll position stable unless something new arrived.
          if (prev && prev.messages.length === data.messages.length) return prev;
          return data;
        });
        // Loading the thread marked it read - reflect that in the list and
        // (when there was something new) the toolbar badge.
        setConversations(prev => prev?.map(c => (c.username === active ? { ...c, unread: 0 } : c)) ?? prev);
        if (data.messages.length !== seenMessages) {
          seenMessages = data.messages.length;
          window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
        }
      })
      .catch(err => { if (!cancelled) setThreadError((err as Error).message); });

    load();
    reloadThreadRef.current = load;
    const timer = setInterval(load, FALLBACK_POLL_MS);
    return () => {
      cancelled = true;
      reloadThreadRef.current = null;
      clearInterval(timer);
    };
  }, [active, token]);

  useRealtimeEvent('message', () => {
    loadConversations();
    reloadThreadRef.current?.();
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread?.messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !active) return;
    setSending(true);
    try {
      const message = await apiFetch<Message>(`/api/messages/${encodeURIComponent(active)}`, { method: 'POST', token, body: { body } });
      setThread(prev => prev && { ...prev, messages: [...prev.messages, message] });
      setDraft('');
      loadConversations();
    } catch (err) {
      setThreadError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const open = (username: string) => setParams({ with: username });

  return (
    <div className={`messages-page ${active ? 'has-active' : ''}`}>
      <aside className="msg-list" aria-label="Conversations">
        <h2>Messages</h2>
        {conversations === null && <div className="explore-loading"><div className="loading-spinner" /></div>}
        {conversations?.length === 0 && !active && (
          <p className="msg-empty">No messages yet. Start a conversation from someone's profile.</p>
        )}
        <ul>
          {conversations?.map(c => (
            <li key={c.id}>
              <button className={`msg-list-item ${c.username === active ? 'active' : ''}`} onClick={() => open(c.username)}>
                <Avatar username={c.username} url={c.avatarUrl} />
                <span className="msg-list-text">
                  <span className="msg-list-top">
                    <strong>{c.username}</strong>
                    <time>{timeLabel(c.lastMessage.createdAt)}</time>
                  </span>
                  <span className={`msg-list-preview ${c.unread > 0 ? 'unread' : ''}`}>
                    {c.lastMessage.fromMe && 'You: '}
                    {c.lastMessage.kind === 'hire' ? '💼 Hire request' : c.lastMessage.body}
                  </span>
                </span>
                {c.unread > 0 && <span className="msg-unread">{c.unread}</span>}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="msg-thread" aria-label="Conversation">
        {!active && <p className="msg-empty center">Select a conversation.</p>}
        {active && threadError && <p className="form-error msg-thread-error">{threadError}</p>}
        {active && !thread && !threadError && <div className="explore-loading"><div className="loading-spinner" /></div>}
        {active && thread && (
          <>
            <header className="msg-thread-header">
              <button className="msg-back" onClick={() => setParams({})} aria-label="Back to conversations">←</button>
              <button className="msg-thread-user" onClick={() => onOpenUser(thread.user.username)}>
                <Avatar username={thread.user.username} url={thread.user.avatarUrl} />
                <span>
                  <strong>{thread.user.username}</strong>
                  {thread.user.title && <small>{thread.user.title}</small>}
                </span>
              </button>
            </header>

            <div className="msg-scroll">
              {thread.messages.length === 0 && <p className="msg-empty center">Say hi to @{thread.user.username}!</p>}
              {thread.messages.map(m => (
                <div key={m.id} className={`msg-bubble-row ${m.fromMe ? 'mine' : ''}`}>
                  {m.kind === 'hire' && m.meta ? (
                    <div className="msg-bubble hire">
                      <span className="msg-hire-label"><BriefcaseIcon /> Hire request</span>
                      <strong>{m.meta.projectTitle}</strong>
                      <dl>
                        {m.meta.budget && <div><dt>Budget</dt><dd>{m.meta.budget}</dd></div>}
                        {m.meta.timeline && <div><dt>Timeline</dt><dd>{m.meta.timeline}</dd></div>}
                      </dl>
                      <p>{m.body.split('\n\n').slice(1).join('\n\n')}</p>
                      <time>{timeLabel(m.createdAt)}</time>
                    </div>
                  ) : (
                    <div className="msg-bubble">
                      <p>{m.body}</p>
                      <time>{timeLabel(m.createdAt)}</time>
                    </div>
                  )}
                </div>
              ))}
              <div ref={endRef} />
            </div>

            {thread.canMessage ? (
              <form className="msg-compose" onSubmit={send}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      (e.currentTarget.form as HTMLFormElement).requestSubmit();
                    }
                  }}
                  placeholder={`Message @${thread.user.username}`}
                  maxLength={5000}
                  rows={2}
                />
                <button type="submit" className="btn primary" disabled={!draft.trim() || sending} aria-label="Send">
                  <SendIcon />
                </button>
              </form>
            ) : (
              <p className="msg-blocked">You've blocked @{thread.user.username}. Unblock them from their profile to send messages.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
