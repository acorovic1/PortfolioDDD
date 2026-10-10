import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/frontend/hooks/useAuth';
import { apiFetch } from '@/frontend/utils/api';
import { MessageIcon } from '@/frontend/svg/Icons';
import { useRealtimeEvent } from '@/frontend/realtime/realtime';

// Safety net only - changes are pushed over the realtime stream.
const FALLBACK_POLL_MS = 5 * 60_000;

// Toolbar shortcut to the inbox, with an unread-message badge.
export default function MessagesButton() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const loadRef = useRef<(() => void) | null>(null);

  useRealtimeEvent('message', () => loadRef.current?.());

  useEffect(() => {
    if (!token) return;
    const load = () => apiFetch<{ count: number }>('/api/messages/unread', { token })
      .then(data => setUnread(data.count))
      .catch(() => {});
    load();
    loadRef.current = load;
    const timer = setInterval(load, FALLBACK_POLL_MS);
    // The inbox announces when it has marked a thread read.
    window.addEventListener('messages-read', load);
    return () => {
      clearInterval(timer);
      loadRef.current = null;
      window.removeEventListener('messages-read', load);
    };
    // Re-check when navigating (e.g. after reading a thread).
  }, [token, location.pathname, location.search]);

  return (
    <button className="notification-bell" onClick={() => navigate('/messages')} title="Messages" aria-label={`Messages${unread ? ` (${unread} unread)` : ''}`}>
      <MessageIcon />
      {unread > 0 && <span className="notification-badge">{unread > 9 ? '9+' : unread}</span>}
    </button>
  );
}
