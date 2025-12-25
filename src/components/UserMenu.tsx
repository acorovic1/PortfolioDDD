import { useState } from 'react';

export default function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="user-menu-container">
      <button 
        className="user-menu-button"
        onClick={() => setIsOpen(!isOpen)}
        title="User menu"
      >
        <img 
          src="https://api.dicebear.com/7.x/avataaars/svg?seed=User" 
          alt="User" 
          className="user-avatar-small"
        />
        <svg 
          className={`chevron ${isOpen ? 'open' : ''}`}
          width="16" 
          height="16" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className="user-dropdown">
          <div className="user-dropdown-header">
            <img 
              src="https://api.dicebear.com/7.x/avataaars/svg?seed=User" 
              alt="User" 
              className="user-avatar-large"
            />
            <div>
              <p className="user-name">Alex Rivera</p>
              <p className="user-email">alex@example.com</p>
            </div>
          </div>
          <div className="user-dropdown-divider"></div>
          <button className="user-dropdown-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>Profile</span>
          </button>
          <button className="user-dropdown-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v6m0 6v6m9-9h-6m-6 0H3" />
            </svg>
            <span>Settings</span>
          </button>
          <button className="user-dropdown-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4m0-4h.01" />
            </svg>
            <span>Help & Support</span>
          </button>
          <div className="user-dropdown-divider"></div>
          <button className="user-dropdown-item danger">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}