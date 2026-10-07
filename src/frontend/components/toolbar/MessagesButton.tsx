import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/frontend/hooks/useAuth';
import { apiFetch } from '@/frontend/utils/api';
import { MessageIcon } from '@/frontend/svg/Icons';

const POLL_MS = 30_000;

// Toolbar shortcut to the inbox, with an unread-message badge.
export default function MessagesButton() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!token) return;
    const load = () => apiFetch<{ count: number }>('/api/messages/unread', { token })
      .then(data => setUnread(data.count))
      .catch(() => {});
    load();
    const timer = setInterval(load, POLL_MS);
    // The inbox announces when it has marked a thread read.
    window.addEventListener('messages-read', load);
    return () => {
      clearInterval(timer);
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
