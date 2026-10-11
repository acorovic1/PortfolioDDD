import { useState, useEffect } from 'react';
import { profilePath } from '@/frontend/utils/api';
import { BellIcon } from '@/frontend/svg/Icons';
import { useAuth } from '@/frontend/hooks/useAuth';
import { API_BASE_URL } from '@/frontend/config/api';
import { useNavigate } from 'react-router-dom';
import { useRealtimeEvent } from '@/frontend/realtime/realtime';
import { useI18n } from '@/frontend/hooks/useI18n';

type Notification = {
  id: string;
  type: string;
  message: string;
  actorUsername: string;
  artworkId: string | null;
  isRead: boolean;
  createdAt: string;
};

// Where clicking a notification takes you.
function notificationTarget(n: Notification, ownUsername: string | undefined): string | null {
  switch (n.type) {
    case 'follow':
      return profilePath(n.actorUsername);
    case 'new_artwork':
      return n.artworkId ? `${profilePath(n.actorUsername)}?artwork=${n.artworkId}&src=notification` : null;
    case 'message':
    case 'hire':
      return `/messages?with=${encodeURIComponent(n.actorUsername)}`;
    case 'like':
    case 'comment':
      return ownUsername ? '/portfolio' : null;
    default:
      return null;
  }
}

export default function NotificationBell() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const { t, timeAgo } = useI18n();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = () => {
    if (!token) return;
    fetch(`${API_BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!data) return;
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      })
      .catch(err => console.error('Failed to load notifications:', err));
  };

  // Fetch once on mount so the unread badge is accurate without opening the
  // dropdown. New notifications are then pushed over the realtime stream;
  // the slow poll is only a safety net for when the stream is down.
  useRealtimeEvent('notification', () => fetchNotifications());

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 5 * 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const toggleOpen = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) fetchNotifications();
  };

  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount(prev => Math.max(0, prev - 1));

    if (!token) return;
    fetch(`${API_BASE_URL}/api/notifications/${id}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(err => console.error('Failed to mark notification read:', err));
  };

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);

    if (!token) return;
    fetch(`${API_BASE_URL}/api/notifications/read-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(err => console.error('Failed to mark all notifications read:', err));
  };

  return (
    <div className="notification-container">
      <button
        className="notification-bell"
        onClick={toggleOpen}
        title={t('notifications.title')}
      >
        <BellIcon />
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h4>{t('notifications.title')}</h4>
            <button className="mark-read" onClick={markAllRead}>{t('notifications.markAllRead')}</button>
          </div>
          <div className="notification-list">
            {notifications.length === 0 && (
              <div className="notification-item">
                <div className="notification-content">
                  <p className="notification-text">{t('notifications.empty')}</p>
                </div>
              </div>
            )}
            {notifications.map(n => (
              <div
                key={n.id}
                className={`notification-item ${n.isRead ? '' : 'unread'}`}
                onClick={() => {
                  if (!n.isRead) markRead(n.id);
                  const target = notificationTarget(n, user?.username);
                  if (target) {
                    setIsOpen(false);
                    navigate(target);
                  }
                }}
              >
                <div className="notification-dot"></div>
                <div className="notification-content">
                  <p className="notification-text">{n.message}</p>
                  <span className="notification-time">{timeAgo(n.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
