import { useState, useEffect, type ReactNode } from 'react';
import { AuthContext, type ProfileUpdateFields } from './auth-context';
import type { User } from './auth-types';
import { API_BASE_URL } from '@/frontend/config/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored token on mount
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
      fetchCurrentUser(storedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  // Sliding session: while the tab is open and the user is signed in, quietly
  // re-issue the token well before its 7-day expiry so an active user is
  // never suddenly logged out mid-session. A tab left open past that (or a
  // token that's already expired) just fails silently here and falls back to
  // the normal expired-token handling next time a real request 401s.
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (data?.token) {
            localStorage.setItem('token', data.token);
            setToken(data.token);
          }
        })
        .catch(err => console.error('Failed to refresh session:', err));
    }, 60 * 60 * 1000); // hourly

    return () => clearInterval(interval);
  }, [token]);

  const fetchCurrentUser = async (authToken: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else if (response.status === 401 || response.status === 403) {
        // Token is actually invalid/expired - safe to clear it.
        localStorage.removeItem('token');
        setToken(null);
      } else {
        // Server/database is temporarily unavailable - keep the token so we
        // retry automatically next time this provider mounts, instead of
        // forcing the user to log in again over a transient outage.
        console.error('Failed to fetch user: server returned', response.status);
      }
    } catch (error) {
      // Network failure (e.g. backend or its database is down) - keep the token.
      console.error('Failed to fetch user, backend unreachable:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    localStorage.setItem('token', data.token);
    setToken(data.token);
    // The login response only has {id, email, username, name} - fetch the
    // full profile (avatar, bio, skills, ...) right away.
    await fetchCurrentUser(data.token);
  };

  const register = async (email: string, password: string, username: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, username })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
    }

    const data = await response.json();
    localStorage.setItem('token', data.token);
    setToken(data.token);
    await fetchCurrentUser(data.token);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const updateUsername = async (username: string) => {
    const response = await fetch(`${API_BASE_URL}/api/users/me/username`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ username }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update username');
    }

    setUser(prev => (prev ? { ...prev, username } : prev));
  };

  const updateEmail = async (email: string) => {
    const response = await fetch(`${API_BASE_URL}/api/users/me/email`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update email');
    }

    // A changed address has to be confirmed again.
    setUser(await response.json());
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const response = await fetch(`${API_BASE_URL}/api/users/me/password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to change password');
    }
  };

  const updateProfile = async (fields: ProfileUpdateFields) => {
    // Optimistic: profile inputs are driven by `user`, so apply the change
    // right away (no lag while typing/toggling), then take the server's
    // normalized version - or roll back if it's rejected.
    const previous = user;
    setUser(prev => (prev ? { ...prev, ...fields } : prev));

    const response = await fetch(`${API_BASE_URL}/api/users/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(fields),
    });

    if (!response.ok) {
      setUser(previous);
      const error = await response.json();
      throw new Error(error.error || 'Failed to update profile');
    }

    const updated = await response.json();
    setUser(updated);
  };

  const uploadAvatar = async (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);

    const response = await fetch(`${API_BASE_URL}/api/users/me/avatar`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to upload avatar');
    }

    const updated = await response.json();
    setUser(updated);
  };

  const uploadCover = async (file: File) => {
    const formData = new FormData();
    formData.append('cover', file);

    const response = await fetch(`${API_BASE_URL}/api/users/me/cover`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to upload cover image');
    }

    setUser(await response.json());
  };

  const deleteAccount = async (password: string) => {
    const response = await fetch(`${API_BASE_URL}/api/users/me`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete account');
    }

    logout();
  };

  const forgotPassword = async (email: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to request password reset');
    }
  };

  const resetPassword = async (resetToken: string, newPassword: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, newPassword }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reset password');
    }
  };

  const verifyEmail = async (verifyToken: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: verifyToken }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to confirm email');
    }
    // The link may be opened in a tab where this account is signed in.
    if (token) await fetchCurrentUser(token);
  };

  const resendVerification = async () => {
    const response = await fetch(`${API_BASE_URL}/api/auth/resend-verification`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send the confirmation email');
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      login,
      register,
      logout,
      updateUsername,
      updateEmail,
      changePassword,
      updateProfile,
      uploadAvatar,
      uploadCover,
      deleteAccount,
      forgotPassword,
      resetPassword,
      verifyEmail,
      resendVerification,
      isLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
}
