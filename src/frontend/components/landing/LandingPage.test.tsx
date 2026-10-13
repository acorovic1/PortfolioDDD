import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LandingPage from './LandingPage';

let currentUser: { username: string; showMature?: boolean } | null = null;
vi.mock('@/frontend/hooks/useAuth', () => ({
  useAuth: () => ({ user: currentUser, token: currentUser ? 'test-token' : null }),
}));
// WebGL isn't available in jsdom.
vi.mock('@/frontend/components/LoginBackdrop', () => ({ default: () => null }));

const artwork = {
  id: 'a1', title: 'Robot Bust', username: 'alice', avatarUrl: null, thumbnailUrl: null, coverUrl: null,
  likeCount: 3, viewCount: 10, isMature: false, aiGenerated: false,
};

function stubFeed(artworks: unknown[]) {
  const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ artworks, hasMore: false }) }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderLanding() {
  const handlers = {
    onEnterAuth: vi.fn(), onExplore: vi.fn(), onGoToPortfolio: vi.fn(), onOpenArtwork: vi.fn(),
    onOpenUser: vi.fn(), onJobs: vi.fn(), onMarketplace: vi.fn(),
  };
  render(<LandingPage {...handlers} />);
  return handlers;
}

afterEach(() => {
  currentUser = null;
  vi.unstubAllGlobals();
});

describe('LandingPage', () => {
  it('invites visitors to sign up or explore', () => {
    stubFeed([]);
    const handlers = renderLanding();

    // Without the Web Animations API (as here) it goes straight on.
    fireEvent.click(screen.getAllByRole('button', { name: 'Create your portfolio' })[0]);
    expect(handlers.onEnterAuth).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: /explore work/i }));
    expect(handlers.onExplore).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    expect(handlers.onEnterAuth).toHaveBeenCalledWith(false);
  });

  it('sends signed-in users to their portfolio instead', () => {
    currentUser = { username: 'alice' };
    stubFeed([]);
    const handlers = renderLanding();

    expect(screen.queryByRole('button', { name: 'Create your portfolio' })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Go to your portfolio' })[0]);
    expect(handlers.onGoToPortfolio).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Login' })).toBeNull();
  });

  it('shows trending work from the feed, and leaves the section out when there is none', async () => {
    const fetchMock = stubFeed([artwork]);
    const handlers = renderLanding();

    fireEvent.click(await screen.findByRole('button', { name: 'Open "Robot Bust"' }));
    expect(handlers.onOpenArtwork).toHaveBeenCalledWith('alice', 'a1');
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('tab=trending');
  });

  it('has no trending section without artworks', async () => {
    stubFeed([]);
    renderLanding();
    await Promise.resolve();
    expect(screen.queryByText('Trending now')).toBeNull();
  });
});
