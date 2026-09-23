import { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SearchBar from './SearchBar';

vi.mock('@/frontend/hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function Wrapper({ onSelectUser }: { onSelectUser?: (username: string) => void }) {
  const [value, setValue] = useState('');
  return <SearchBar value={value} onChange={setValue} onSelectUser={onSelectUser} />;
}

describe('SearchBar', () => {
  it('does not search until at least 2 characters are typed', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<Wrapper />);
    fireEvent.change(screen.getByPlaceholderText('Search users or artworks...'), { target: { value: 'a' } });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('searches both users and artworks, and shows results grouped by section', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/api/users/search')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ users: [{ id: 'u1', username: 'alice', name: 'Alice' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ artworks: [{ id: 'a1', title: 'Cool Piece', category: 'Sculpture', year: '2026', username: 'alice' }] }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<Wrapper />);
    const input = screen.getByPlaceholderText('Search users or artworks...');
    fireEvent.change(input, { target: { value: 'alice' } });
    fireEvent.focus(input);

    await waitFor(() => expect(screen.getByText('@alice')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('Cool Piece')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Artworks')).toBeInTheDocument();
  });

  it('calls onSelectUser and clears the query when a result is picked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ users: [{ id: 'u1', username: 'alice', name: 'Alice' }] }),
    }));

    const onSelectUser = vi.fn();
    render(<Wrapper onSelectUser={onSelectUser} />);
    const input = screen.getByPlaceholderText('Search users or artworks...');
    fireEvent.change(input, { target: { value: 'alice' } });
    fireEvent.focus(input);

    await waitFor(() => expect(screen.getByText('@alice')).toBeInTheDocument(), { timeout: 2000 });
    fireEvent.mouseDown(screen.getByText('@alice'));

    expect(onSelectUser).toHaveBeenCalledWith('alice');
  });
});
