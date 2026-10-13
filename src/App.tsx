import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Scene3D from '@/frontend/components/Scene3D';
import Sidebar from '@/frontend/components/sidebar/Sidebar';
import Toolbar from '@/frontend/components/toolbar/Toolbar';
import ArtworkShowcase from '@/frontend/components/ArtworkShowcase';
import ExplorePage from '@/frontend/components/explore/ExplorePage';
import AdminPage from '@/frontend/components/moderation/AdminPage';
import MessagesPage from '@/frontend/components/messages/MessagesPage';
import JobsPage from '@/frontend/components/jobs/JobsPage';
import MarketplacePage from '@/frontend/components/marketplace/MarketplacePage';
import AnalyticsPage from '@/frontend/components/analytics/AnalyticsPage';
import ProfileSocialBar from '@/frontend/components/sidebar/ProfileSocialBar';
import LikedPostsPage from '@/frontend/components/LikedPostsPage';
import MyCommentsPage from '@/frontend/components/MyCommentsPage';
import SavedPage from '@/frontend/components/SavedPage';
import SettingsPage from '@/frontend/components/SettingsPage';
import ResetPasswordPage from '@/frontend/components/ResetPasswordPage';
import VerifyEmailPage from '@/frontend/components/VerifyEmailPage';
import LoginForm from '@/frontend/components/LoginForm';
import type { ProfileData } from './types/ProfileData';
import type { PortfolioPiece } from './types/PortfolioPiece';
import type { ViewSource } from './types/Feed';
import { profilePath, customDomainOwner } from '@/frontend/utils/api';
import { toProfileData, profileChanges } from '@/frontend/utils/profile';
import { useRealtimeConnection } from '@/frontend/realtime/realtime';
import { useAuth } from '@/frontend/hooks/useAuth';
import { useLikes } from '@/frontend/hooks/useLikes';
import { useCollections } from '@/frontend/hooks/useCollections';
import { useComments } from '@/frontend/hooks/useComments';
import { useOwnPortfolio } from '@/frontend/hooks/useOwnPortfolio';
import { usePublicProfile } from '@/frontend/hooks/usePublicProfile';

type Page = 'home' | 'login' | 'portfolio' | 'liked-posts' | 'my-comments' | 'saved' | 'settings' | 'admin' | 'messages'
  | 'jobs' | 'marketplace' | 'analytics';

const PAGE_PATHS: Record<Page, string> = {
  home: '/',
  login: '/login',
  portfolio: '/portfolio',
  'liked-posts': '/liked-posts',
  'my-comments': '/my-comments',
  saved: '/saved',
  settings: '/settings',
  admin: '/admin',
  messages: '/messages',
  jobs: '/jobs',
  marketplace: '/marketplace',
  analytics: '/analytics',
};

const PAGE_TITLES: Partial<Record<Page, string>> = {
  portfolio: 'Your portfolio',
  jobs: '3D art jobs',
  marketplace: '3D model marketplace',
  messages: 'Messages',
  analytics: 'Analytics',
  settings: 'Settings',
  saved: 'Saved',
  'liked-posts': 'Liked posts',
  'my-comments': 'My comments',
  admin: 'Moderation',
  login: 'Sign in',
};

function pageForPath(pathname: string): Page {
  const entry = Object.entries(PAGE_PATHS).find(([, path]) => path === pathname);
  return (entry?.[0] as Page) ?? 'home';
}

function App() {
  const sceneContainerRef = useRef<HTMLDivElement>(null);
  const publicSceneContainerRef = useRef<HTMLDivElement>(null);

  const { user, isLoading, token, updateProfile: updateAuthProfile, uploadAvatar, uploadCover } = useAuth();
  const sessionToken = user ? token : null;
  // One live event stream (new messages / notifications) while signed in.
  useRealtimeConnection(sessionToken);

  const navigate = useNavigate();
  const location = useLocation();
  const page = pageForPath(location.pathname);
  const setPage = (next: Page) => navigate(PAGE_PATHS[next]);
  // Profiles: /@username (what the app links to) or the older /u/username.
  const publicProfileMatch = location.pathname.match(/^\/(?:@|u\/)([^/]+)$/);
  const publicProfileUsername = publicProfileMatch
    ? decodeURIComponent(publicProfileMatch[1])
    // On an artist's custom domain, the home page is their profile.
    : customDomainOwner && location.pathname === '/' ? customDomainOwner : null;

  const [editable, setEditable] = useState(false);
  const own = useOwnPortfolio(sessionToken);
  const pub = usePublicProfile(publicProfileUsername, token);
  const { likedArtworkIds, toggleLike } = useLikes(sessionToken);
  const { commentsByArtwork, loadComments, addComment, deleteComment } = useComments(token, user?.username ?? null);
  const {
    collections, createCollection, renameCollection, deleteCollection, toggleArtworkInCollection,
  } = useCollections(sessionToken);

  // Profiles with 18+ work ask before showing it to viewers who haven't
  // opted in to mature content.
  const [matureAcknowledged, setMatureAcknowledged] = useState<string | null>(null);

  useEffect(() => {
    if (user && page === 'login') {
      navigate(PAGE_PATHS.portfolio, { replace: true });
    }
  }, [user, page, navigate]);

  // Fetch persisted comments for an artwork the first time it's viewed.
  const ownSelectedId = own.artworks[own.selectedIndex]?.id;
  const publicSelectedId = pub.artworks[pub.selectedIndex]?.id;
  useEffect(() => {
    if (ownSelectedId) loadComments(ownSelectedId);
  }, [ownSelectedId, loadComments]);
  useEffect(() => {
    if (publicSelectedId) loadComments(publicSelectedId);
  }, [publicSelectedId, loadComments]);

  // Keep the browser tab title in step with client-side navigation (the
  // server sets it for the first load - see src/backend/seo/seo.ts).
  const currentPublicArtwork = pub.artworks[pub.selectedIndex];
  useEffect(() => {
    let title = PAGE_TITLES[page];
    if (publicProfileUsername) {
      title = currentPublicArtwork
        ? `${currentPublicArtwork.infoData.title || 'Untitled'} by @${publicProfileUsername}`
        : `@${publicProfileUsername}`;
    }
    document.title = title ? `${title} · PortfolioDDD` : 'PortfolioDDD - 3D art portfolios';
  }, [page, publicProfileUsername, currentPublicArtwork]);

  const onToggleLike = (artworkId: string) => {
    const delta = toggleLike(artworkId);
    const bump = (a: PortfolioPiece) => (a.id === artworkId ? { ...a, likeCount: Math.max(0, a.likeCount + delta) } : a);
    own.setArtworks(prev => prev.map(bump));
    pub.setArtworks(prev => prev.map(bump));
  };

  const goToUserProfile = (username: string) => {
    if (user && username === user.username) navigate(PAGE_PATHS.portfolio);
    else navigate(profilePath(username));
  };
  // `source` is recorded with the view (creator analytics' traffic sources).
  const goToArtworkOnProfile = (username: string, artworkId: string, source: ViewSource = 'search') =>
    navigate(`${profilePath(username)}?artwork=${artworkId}&src=${source}`);

  const goToArtwork = (artworkId: string) => {
    const index = own.artworks.findIndex(a => a.id === artworkId);
    if (index >= 0) own.setSelectedIndex(index);
    setPage('portfolio');
  };

  // Liked/saved/community artworks can belong to anyone, not just the current
  // user - route to the owner's own editable page or the read-only profile.
  const openArtworkFrom = (source: ViewSource) => (username: string, artworkId: string) => {
    if (user && username === user.username) goToArtwork(artworkId);
    else goToArtworkOnProfile(username, artworkId, source);
  };

  // Liked/saved/commented lists pass (artworkId, username).
  const goToArtworkAnywhere = (artworkId: string, username: string) => openArtworkFrom('direct')(username, artworkId);

  const profile = toProfileData(user);

  const onProfileChange = (next: ProfileData) => {
    const changes = profileChanges(profile, next);
    if (Object.keys(changes).length === 0) return;
    updateAuthProfile(changes).catch(err => console.error('Failed to save profile:', err));
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  const goToLogin = () => setPage('login');

  const toolbarNav = {
    onLogoClick: () => setPage('home'),
    onLoginClick: goToLogin,
    onProfileClick: () => setPage('portfolio'),
    onLikedPostsClick: () => setPage('liked-posts'),
    onMyCommentsClick: () => setPage('my-comments'),
    onSavedClick: () => setPage('saved'),
    onSettingsClick: () => setPage('settings'),
    onSelectUser: goToUserProfile,
    onSelectArtwork: goToArtworkOnProfile,
  };

  // Toolbar + one full-width page.
  const singleColumnPage = (content: ReactNode) => (
    <div className="app-layout single-column">
      <Toolbar {...toolbarNav} showViewModeToggle={false} />
      {content}
    </div>
  );

  // Shared by the owner's and the public showcase.
  const showcaseSocialProps = {
    likedArtworkIds,
    onToggleLike,
    commentsByArtwork,
    onAddComment: addComment,
    onDeleteComment: deleteComment,
    collections,
    onToggleArtworkInCollection: toggleArtworkInCollection,
    onCreateCollection: createCollection,
  };

  if (location.pathname === '/reset-password') {
    const resetToken = new URLSearchParams(location.search).get('token') ?? '';
    return <ResetPasswordPage token={resetToken} onDone={() => navigate(PAGE_PATHS.login, { replace: true })} />;
  }

  if (location.pathname === '/verify-email') {
    const verifyToken = new URLSearchParams(location.search).get('token') ?? '';
    return (
      <VerifyEmailPage
        token={verifyToken}
        onDone={() => navigate(user ? PAGE_PATHS.portfolio : PAGE_PATHS.login, { replace: true })}
      />
    );
  }

  if (publicProfileUsername) {
    const viewedProfile = pub.profileUser ? toProfileData(pub.profileUser, { includeEmail: false }) : null;
    const showMatureGate = pub.artworks.some(a => a.publishing?.isMature)
      && !user?.showMature
      && matureAcknowledged !== publicProfileUsername;

    return (
      <div className="app-layout" key={publicProfileUsername}>
        <Toolbar {...toolbarNav} showViewModeToggle={false} />

        {pub.error ? (
          <div className="activity-empty">
            <h3>Couldn't load this profile</h3>
            <p>{pub.error}</p>
          </div>
        ) : (
          <>
            <div className="portfolio">
              <div ref={publicSceneContainerRef} className="scene">
                {showMatureGate && (
                  <div className="mature-gate" role="dialog" aria-label="Mature content warning">
                    <h3>This portfolio contains mature content</h3>
                    <p>Some artworks are marked 18+. You can always show mature content in Settings.</p>
                    <button className="btn primary" onClick={() => setMatureAcknowledged(publicProfileUsername)}>
                      I'm 18 or older - show it
                    </button>
                  </div>
                )}
                <Scene3D
                  artworks={pub.artworks}
                  containerRef={publicSceneContainerRef}
                  onArtworkIndexChange={pub.setSelectedIndex}
                  onArtworkAdd={pub.addArtwork}
                  editable={false}
                  initialIndex={pub.selectedIndex}
                  remoteArtworksToLoad={pub.remoteArtworksToLoad}
                />
              </div>

              <ArtworkShowcase
                artworks={pub.artworks}
                selectedIndex={pub.selectedIndex}
                editable={false}
                onRenderAdd={() => {}}
                onDeleteRender={() => {}}
                onInfoUpdate={() => {}}
                onDeleteArtwork={() => {}}
                {...showcaseSocialProps}
                ownerUsername={publicProfileUsername}
              />
            </div>

            {viewedProfile && (
              <Sidebar profile={viewedProfile} editable={false}>
                <ProfileSocialBar
                  username={publicProfileUsername}
                  onOpenUser={goToUserProfile}
                  onRequireLogin={goToLogin}
                />
              </Sidebar>
            )}
          </>
        )}
      </div>
    );
  }

  if (page === 'login' && !user) {
    return singleColumnPage(<LoginForm />);
  }

  if (page === 'portfolio' && user) {
    return (
      <div className="app-layout">
        <Toolbar {...toolbarNav} onViewModeChange={mode => setEditable(mode === 'edit')} />

        <div className="portfolio">
          <div ref={sceneContainerRef} className="scene">
            <Scene3D
              artworks={own.artworks}
              containerRef={sceneContainerRef}
              onArtworkIndexChange={own.setSelectedIndex}
              onArtworkAdd={own.addArtwork}
              onArtworksReorder={own.reorderArtworks}
              editable={editable}
              canManage
              initialIndex={own.selectedIndex}
              remoteArtworksToLoad={own.remoteArtworksToLoad}
            />
          </div>

          <ArtworkShowcase
            artworks={own.artworks}
            selectedIndex={own.selectedIndex}
            editable={editable}
            onRenderAdd={own.addRender}
            onDeleteRender={own.deleteRender}
            onInfoUpdate={own.updateInfo}
            onDeleteArtwork={own.deleteArtwork}
            {...showcaseSocialProps}
            ownerUsername={user.username}
            onPublishingUpdate={own.updatePublishing}
          />
        </div>

        <Sidebar
          profile={profile}
          editable={editable}
          onChange={onProfileChange}
          onAvatarUpload={file => uploadAvatar(file).catch(err => console.error('Failed to upload avatar:', err))}
          onCoverUpload={file => uploadCover(file).catch(err => console.error('Failed to upload cover image:', err))}
        >
          <ProfileSocialBar username={user.username} onOpenUser={goToUserProfile} onRequireLogin={goToLogin} />
        </Sidebar>
      </div>
    );
  }

  if (page === 'liked-posts' && user) {
    return singleColumnPage(
      <LikedPostsPage likedArtworkIds={likedArtworkIds} onSelectArtwork={goToArtworkAnywhere} />
    );
  }

  if (page === 'my-comments' && user) {
    return singleColumnPage(
      <MyCommentsPage
        commentsByArtwork={commentsByArtwork}
        currentUserName={user.username}
        onSelectArtwork={goToArtworkAnywhere}
      />
    );
  }

  if (page === 'saved' && user) {
    return singleColumnPage(
      <SavedPage
        collections={collections}
        onCreateCollection={createCollection}
        onRenameCollection={renameCollection}
        onDeleteCollection={deleteCollection}
        onSelectArtwork={goToArtworkAnywhere}
      />
    );
  }

  if (page === 'jobs') {
    return singleColumnPage(<JobsPage onOpenUser={goToUserProfile} onRequireLogin={goToLogin} />);
  }

  if (page === 'marketplace') {
    return singleColumnPage(<MarketplacePage onOpenArtwork={openArtworkFrom('marketplace')} onOpenUser={goToUserProfile} />);
  }

  if (page === 'analytics' && user) {
    return singleColumnPage(<AnalyticsPage onOpenArtwork={goToArtwork} />);
  }

  if (page === 'messages' && user) {
    return singleColumnPage(<MessagesPage onOpenUser={goToUserProfile} />);
  }

  if (page === 'admin' && user?.role === 'admin') {
    return singleColumnPage(<AdminPage />);
  }

  if (page === 'settings' && user) {
    return singleColumnPage(<SettingsPage />);
  }

  return singleColumnPage(
    <ExplorePage
      onOpenArtwork={(username, artworkId, source) => openArtworkFrom(source)(username, artworkId)}
      onOpenUser={goToUserProfile}
    />
  );
}

export default App;
