import { useState, useEffect } from 'react';
import { BellIcon } from '@/frontend/svg/Icons';
import { useAuth } from '@/frontend/hooks/useAuth';
import { API_BASE_URL } from '@/frontend/config/api';

type Notification = {
  id: string;
  type: string;
  message: string;
  artworkId: string | null;
  isRead: boolean;
  createdAt: string;
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function NotificationBell() {
  const { token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
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
  // dropdown, then keep polling so a new like/comment shows up without the
  // user having to close and reopen the bell. No websocket infra exists here,
  // so this is the lightest way to approximate "real-time".
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
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
        title="Notifications"
      >
        <BellIcon />
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h4>Notifications</h4>
            <button className="mark-read" onClick={markAllRead}>Mark all read</button>
          </div>
          <div className="notification-list">
            {notifications.length === 0 && (
              <div className="notification-item">
                <div className="notification-content">
                  <p className="notification-text">No notifications yet</p>
                </div>
              </div>
            )}
            {notifications.map(n => (
              <div
                key={n.id}
                className={`notification-item ${n.isRead ? '' : 'unread'}`}
                onClick={() => !n.isRead && markRead(n.id)}
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
