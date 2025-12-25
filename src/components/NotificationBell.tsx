import { useState } from 'react';

type NotificationBellProps = {
  count?: number;
};

export default function NotificationBell({ count = 0 }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="notification-container">
      <button 
        className="notification-bell"
        onClick={() => setIsOpen(!isOpen)}
        title="Notifications"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && <span className="notification-badge">{count > 9 ? '9+' : count}</span>}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h4>Notifications</h4>
            <button className="mark-read">Mark all read</button>
          </div>
          <div className="notification-list">
            <div className="notification-item unread">
              <div className="notification-dot"></div>
              <div className="notification-content">
                <p className="notification-text">New artwork added to gallery</p>
                <span className="notification-time">2 minutes ago</span>
              </div>
            </div>
            <div className="notification-item unread">
              <div className="notification-dot"></div>
              <div className="notification-content">
                <p className="notification-text">Profile updated successfully</p>
                <span className="notification-time">1 hour ago</span>
              </div>
            </div>
            <div className="notification-item">
              <div className="notification-dot"></div>
              <div className="notification-content">
                <p className="notification-text">Welcome to Portfolio Viewer!</p>
                <span className="notification-time">3 days ago</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}