import { useState, useRef, useEffect } from 'react';
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
import type { ProfileData } from './types/ProfileData';
import type { PortfolioPiece, PublishingState, RemoteArtwork } from './types/PortfolioPiece';
import type { ViewSource } from './types/Feed';
import { apiFetch, assetUrl } from '@/frontend/utils/api';
import { useRealtimeConnection } from '@/frontend/realtime/realtime';
import type { ArtworkInfoData } from './types/ArtworkInfoData';
import type { Comment } from './types/Comment';
import type { Collection } from './types/Collection';
import { pickPortfolioImage } from './types/PortfolioPiece';
import LoginForm from '@/frontend/components/LoginForm';
import { useAuth } from '@/frontend/hooks/useAuth';
import { API_BASE_URL } from '@/frontend/config/api';
import type { User } from '@/frontend/contexts/auth-types';

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

function pageForPath(pathname: string): Page {
  const entry = Object.entries(PAGE_PATHS).find(([, path]) => path === pathname);
  return (entry?.[0] as Page) ?? 'home';
}



// Znaci... ovaj artworks sada mora biti tipa PortfolioPiece[]... 

// u portfolioPiece razdvoji 3D djavole od slika i infoa.. 


function App() {
  const sceneContainerRef = useRef<HTMLDivElement>(null);

  const { user, isLoading, token, updateProfile: updateAuthProfile, uploadAvatar, uploadCover } = useAuth();
  // One live event stream (new messages / notifications) while signed in.
  useRealtimeConnection(user ? token : null);

  const navigate = useNavigate();
  const location = useLocation();
  const page = pageForPath(location.pathname);
  const setPage = (next: Page) => navigate(PAGE_PATHS[next]);
  const publicProfileMatch = location.pathname.match(/^\/u\/([^/]+)$/);
  const publicProfileUsername = publicProfileMatch ? decodeURIComponent(publicProfileMatch[1]) : null;

  const [editable, setEditable] = useState(false);
  const [selectedArtworkIndex, setSelectedArtworkIndex] = useState(0);
  const [artworks, setArtworks] = useState<PortfolioPiece[]>([]);
  const [remoteArtworksToLoad, setRemoteArtworksToLoad] = useState<RemoteArtwork[] | null>(null);
  const [likedArtworkIds, setLikedArtworkIds] = useState<Record<string, boolean>>({});
  const [commentsByArtwork, setCommentsByArtwork] = useState<Record<string, Comment[]>>({});
  const [collections, setCollections] = useState<Collection[]>([]);
  const hasFetchedPortfolioRef = useRef(false);
  const fetchedCommentsRef = useRef<Set<string>>(new Set());

  // Read-only view of another user's portfolio (/u/:username) - mirrors the
  // owner's own scene/showcase state above, but hydrated from the public
  // portfolio API instead of the authenticated user's own artworks.
  const publicSceneContainerRef = useRef<HTMLDivElement>(null);
  const [publicProfileUser, setPublicProfileUser] = useState<User | null>(null);
  const [publicArtworks, setPublicArtworks] = useState<PortfolioPiece[]>([]);
  const [publicRemoteArtworksToLoad, setPublicRemoteArtworksToLoad] = useState<RemoteArtwork[] | null>(null);
  const [publicSelectedArtworkIndex, setPublicSelectedArtworkIndex] = useState(0);
  const [publicProfileError, setPublicProfileError] = useState('');

  useEffect(() => {
    if (user && page === 'login') {
      navigate(PAGE_PATHS.portfolio, { replace: true });
    }
  }, [user, page, navigate]);

  // Load the user's persisted likes, collections, and their own saved artworks
  // (reconstructed into the 3D scene via Scene3D's remoteArtworksToLoad prop)
  // once they're signed in. Guarded to run only once per login, so navigating
  // between pages doesn't keep re-fetching/re-adding the same artworks.
  useEffect(() => {
    if (!user || !token) return;

    fetch(`${API_BASE_URL}/api/portfolio/likes`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : []))
      .then((ids: string[]) => setLikedArtworkIds(Object.fromEntries(ids.map(id => [id, true]))))
      .catch(err => console.error('Failed to load likes:', err));

    fetch(`${API_BASE_URL}/api/collections`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : []))
      .then((data: Collection[]) => setCollections(data))
      .catch(err => console.error('Failed to load collections:', err));

    if (!hasFetchedPortfolioRef.current) {
      hasFetchedPortfolioRef.current = true;
      fetch(`${API_BASE_URL}/api/portfolio`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => (res.ok ? res.json() : []))
        .then((data: RemoteArtwork[]) => setRemoteArtworksToLoad(data))
        .catch(err => console.error('Failed to load saved artworks:', err));
    }
  }, [user, token]);

  // Fetch persisted comments for an artwork the first time it's viewed. The
  // token is optional (comments on public work are public) but lets owners
  // read comments on their own drafts/private work. Previously comments only ever came from local
  // optimistic state, so anything posted in an earlier session - or by anyone
  // else - never showed up.
  const fetchCommentsForArtwork = (artwork: PortfolioPiece, authToken: string | null) => {
    if (fetchedCommentsRef.current.has(artwork.id)) return;
    fetchedCommentsRef.current.add(artwork.id);

    fetch(`${API_BASE_URL}/api/portfolio/artworks/${artwork.id}/comments`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    })
      .then(res => (res.ok ? res.json() : null))
      .then((serverComments: Comment[] | null) => {
        if (!serverComments) return;
        setCommentsByArtwork(prev => {
          const existing = prev[artwork.id] ?? [];
          const serverIds = new Set(serverComments.map(c => c.id));
          // Keep any comment not yet reflected on the server (e.g. one whose
          // POST is still in flight) instead of dropping it on overwrite.
          const localOnly = existing.filter(c => !serverIds.has(c.id));
          return { ...prev, [artwork.id]: [...serverComments, ...localOnly] };
        });
      })
      .catch(err => console.error('Failed to load comments:', err));
  };

  useEffect(() => {
    const artwork = artworks[selectedArtworkIndex];
    if (artwork) fetchCommentsForArtwork(artwork, token);
  }, [artworks, selectedArtworkIndex, token]);

  // Same as above, for the read-only public-profile scene.
  useEffect(() => {
    const artwork = publicArtworks[publicSelectedArtworkIndex];
    if (artwork) fetchCommentsForArtwork(artwork, token);
  }, [publicArtworks, publicSelectedArtworkIndex, token]);

  // Fetch another user's public portfolio when visiting /u/:username, so the
  // 3D scene can be hydrated the same way the owner's own scene is.
  useEffect(() => {
    if (!publicProfileUsername) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPublicProfileError('');
    setPublicProfileUser(null);
    setPublicArtworks([]);
    setPublicRemoteArtworksToLoad(null);
    setPublicSelectedArtworkIndex(0);

    // A linked artwork (?artwork=id) is requested explicitly, so unlisted
    // artworks open from their share link.
    // (Read from window.location: a ?artwork= switch within the same profile
    // is handled by the deep-link effect below, not by refetching.)
    const linkedArtwork = new URLSearchParams(window.location.search).get('artwork');
    const linkedParam = linkedArtwork ? `&artwork=${encodeURIComponent(linkedArtwork)}` : '';
    fetch(`${API_BASE_URL}/api/users/${encodeURIComponent(publicProfileUsername)}/portfolio?all=true${linkedParam}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'User not found');
        }
        return res.json();
      })
      .then((body: { user: User; artworks: RemoteArtwork[] }) => {
        if (cancelled) return;
        setPublicProfileUser(body.user);
        setPublicRemoteArtworksToLoad(body.artworks);
      })
      .catch(err => {
        if (!cancelled) setPublicProfileError(err instanceof Error ? err.message : 'Failed to load profile');
      });

    return () => {
      cancelled = true;
    };
  }, [publicProfileUsername, token]);

  // View tracking for other people's artworks. The first artwork seen gets
  // the source it was opened from (?src=, e.g. explore/search), or external/
  // direct; moving around the carousel afterwards counts as 'profile'.
  const viewedArtworkIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    viewedArtworkIdsRef.current = new Set();
  }, [publicProfileUsername]);

  useEffect(() => {
    if (!publicProfileUsername) return;
    const artwork = publicArtworks[publicSelectedArtworkIndex];
    if (!artwork || viewedArtworkIdsRef.current.has(artwork.id)) return;

    const isFirst = viewedArtworkIdsRef.current.size === 0;
    viewedArtworkIdsRef.current.add(artwork.id);

    const params = new URLSearchParams(window.location.search);
    const linkedSource = params.get('artwork') === artwork.id ? params.get('src') as ViewSource | null : null;
    let source: ViewSource = 'profile';
    if (linkedSource) {
      source = linkedSource;
    } else if (isFirst) {
      const fromElsewhere = document.referrer && new URL(document.referrer).origin !== window.location.origin;
      source = fromElsewhere ? 'external' : 'direct';
    }

    apiFetch<{ counted: boolean; viewCount: number }>(`/api/artworks/${artwork.id}/view`, {
      method: 'POST',
      token,
      body: { source },
    })
      .then(({ viewCount }) => {
        setPublicArtworks(prev => prev.map(a => (
          a.id === artwork.id && a.publishing ? { ...a, publishing: { ...a.publishing, viewCount } } : a
        )));
      })
      .catch(err => console.error('Failed to record view:', err));
  }, [publicArtworks, publicSelectedArtworkIndex, publicProfileUsername, token]);

  // Profiles with 18+ work ask before showing it to viewers who haven't
  // opted in to mature content.
  const [matureAcknowledged, setMatureAcknowledged] = useState<string | null>(null);

  // Deep-link to a specific artwork on a public profile (e.g. from search),
  // once that artwork has loaded into the scene.
  useEffect(() => {
    if (!publicProfileUsername) return;
    const highlightId = new URLSearchParams(location.search).get('artwork');
    if (!highlightId) return;
    const index = publicArtworks.findIndex(a => a.id === highlightId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (index >= 0) setPublicSelectedArtworkIndex(index);
  }, [publicArtworks, publicProfileUsername, location.search]);

  // Reset all per-session state when the user logs out, so a different user
  // logging in afterwards (without a full page reload) gets a clean slate
  // instead of the previous account's portfolio/likes/collections.
  useEffect(() => {
    if (user) return;
    hasFetchedPortfolioRef.current = false;
    fetchedCommentsRef.current.clear();
    // logout() is triggered from other components (e.g. UserMenu) with no
    // shared callback to hook into, so reacting to `user` becoming null is
    // the only place this reset can live.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setArtworks([]);
    setRemoteArtworksToLoad(null);
    setLikedArtworkIds({});
    setCommentsByArtwork({});
    setCollections([]);
  }, [user]);

  const handleViewModeChange = (mode: 'view' | 'edit') => {
    setEditable(mode === 'edit');

    // console.log("Change mode.. number of artworks = ",artworks.length)
    // artworks.forEach(element => {

    //   console.log("Change mode - Object with title ", element.infoData.title, " has ", element.renders.length, " renders!");
    // });
  };

  const handleSearch = (query: string) => {
    console.log('Search query:', query);
  };

  const goToUserProfile = (username: string) => {
    if (user && username === user.username) navigate(PAGE_PATHS.portfolio);
    else navigate(`/u/${username}`);
  };
  // `source` is recorded with the view (creator analytics' traffic sources).
  const goToArtworkOnProfile = (username: string, artworkId: string, source: ViewSource = 'search') =>
    navigate(`/u/${username}?artwork=${artworkId}&src=${source}`);

  const onArtworkAdd = (newArtwork: PortfolioPiece) => {
     setArtworks(prev => [...prev, newArtwork]);
    //addArtwork(newArtwork);

  };

  const onPublicArtworkAdd = (newArtwork: PortfolioPiece) => {
    setPublicArtworks(prev => [...prev, newArtwork]);
  };

  const onRenderAdd = async () => {
    const picked = await pickPortfolioImage();
    if (!picked || selectedArtworkIndex < 0 || selectedArtworkIndex >= artworks.length) return;

    const artwork = artworks[selectedArtworkIndex];
    const { image, file } = picked;

    if (!token) return;

    const formData = new FormData();
    formData.append('image', file);
    formData.append('caption', image.caption);

    try {
      const res = await fetch(`${API_BASE_URL}/api/portfolio/artworks/${artwork.id}/renders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        console.error('Failed to upload render:', res.status);
        return;
      }

      const saved = await res.json();
      // Use the backend's persisted render (real URL + id) rather than the
      // local blob URL, so it's still valid after this session ends.
      setArtworks(prev => prev.map(a => (
        a.id === artwork.id ? { ...a, renders: [...a.renders, { id: saved.id, url: assetUrl(saved.url)!, caption: saved.caption }] } : a
      )));
    } catch (error) {
      console.error('Failed to upload render:', error);
    }
  };

  const onDeleteRender = (renderId: string) => {
    if (selectedArtworkIndex < 0 || selectedArtworkIndex >= artworks.length) return;
    const artwork = artworks[selectedArtworkIndex];

    setArtworks(prev => prev.map(a => (
      a.id === artwork.id ? { ...a, renders: a.renders.filter(r => r.id !== renderId) } : a
    )));

    if (!token) return;
    fetch(`${API_BASE_URL}/api/portfolio/artworks/${artwork.id}/renders/${renderId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(err => console.error('Failed to delete render:', err));
  };

  const onDeleteArtwork = (artworkId: string) => {
    setArtworks(prev => prev.filter(a => a.id !== artworkId));
    setSelectedArtworkIndex(0);

    if (!token) return;
    fetch(`${API_BASE_URL}/api/portfolio/artworks/${artworkId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(err => console.error('Failed to delete artwork:', err));
  };

  const onPublishingUpdate = (artworkId: string, fields: Partial<PublishingState>) => {
    const previous = artworks.find(a => a.id === artworkId)?.publishing;
    setArtworks(prev => prev.map(a => (
      a.id === artworkId && a.publishing ? { ...a, publishing: { ...a.publishing, ...fields } } : a
    )));

    if (!token) return;
    const body: Record<string, unknown> = {};
    if (fields.visibility !== undefined) body.visibility = fields.visibility;
    if (fields.publishedAt !== undefined) body.publishedAt = fields.publishedAt;
    if (fields.isMature !== undefined) body.isMature = fields.isMature;
    if (fields.aiGenerated !== undefined) body.aiGenerated = fields.aiGenerated;

    apiFetch(`/api/portfolio/artworks/${artworkId}`, { method: 'PUT', token, body }).catch(err => {
      console.error('Failed to update publishing settings:', err);
      if (previous) {
        setArtworks(prev => prev.map(a => (a.id === artworkId ? { ...a, publishing: previous } : a)));
      }
    });
  };

  const onToggleLike = (artworkId: string) => {
    const wasLiked = !!likedArtworkIds[artworkId];
    setLikedArtworkIds(prev => ({ ...prev, [artworkId]: !wasLiked }));

    const delta = wasLiked ? -1 : 1;
    const bump = (a: PortfolioPiece) => (a.id === artworkId ? { ...a, likeCount: Math.max(0, a.likeCount + delta) } : a);
    setArtworks(prev => prev.map(bump));
    setPublicArtworks(prev => prev.map(bump));

    if (!token) return;
    fetch(`${API_BASE_URL}/api/portfolio/artworks/${artworkId}/like`, {
      method: wasLiked ? 'DELETE' : 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(err => console.error('Failed to sync like:', err));
  };

  const onAddComment = (artworkId: string, text: string) => {
    if (!user) return;

    const tempId = crypto.randomUUID();
    const comment: Comment = {
      id: tempId,
      author: user.username,
      text,
      postedAt: 'Just now',
      artworkId,
    };

    setCommentsByArtwork(prev => ({
      ...prev,
      [artworkId]: [...(prev[artworkId] ?? []), comment],
    }));

    if (!token) return;

    const rollback = () => {
      setCommentsByArtwork(prev => ({
        ...prev,
        [artworkId]: (prev[artworkId] ?? []).filter(c => c.id !== tempId),
      }));
    };

    fetch(`${API_BASE_URL}/api/portfolio/artworks/${artworkId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text }),
    })
      .then(async res => {
        if (!res.ok) {
          console.error('Failed to persist comment: server returned', res.status);
          rollback();
          return;
        }

        // Swap the optimistic temp id/timestamp for the backend's real ones,
        // so later actions (e.g. deleting this comment) target the right record.
        const saved: Comment = await res.json();
        setCommentsByArtwork(prev => ({
          ...prev,
          [artworkId]: (prev[artworkId] ?? []).map(c => (c.id === tempId ? saved : c)),
        }));
      })
      .catch(err => {
        console.error('Failed to persist comment:', err);
        rollback();
      });
  };

  const onDeleteComment = (artworkId: string, commentId: string) => {
    const previous = commentsByArtwork[artworkId] ?? [];
    setCommentsByArtwork(prev => ({
      ...prev,
      [artworkId]: (prev[artworkId] ?? []).filter(c => c.id !== commentId),
    }));

    if (!token) return;
    fetch(`${API_BASE_URL}/api/portfolio/artworks/${artworkId}/comments/${commentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => {
      if (!res.ok) {
        console.error('Failed to delete comment: server returned', res.status);
        setCommentsByArtwork(prev => ({ ...prev, [artworkId]: previous }));
      }
    }).catch(err => {
      console.error('Failed to delete comment:', err);
      setCommentsByArtwork(prev => ({ ...prev, [artworkId]: previous }));
    });
  };

  const onCreateCollection = (name: string) => {
    if (!token) return;

    fetch(`${API_BASE_URL}/api/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    })
      .then(res => (res.ok ? res.json() : null))
      .then((collection: Collection | null) => {
        if (collection) setCollections(prev => [...prev, collection]);
      })
      .catch(err => console.error('Failed to create collection:', err));
  };

  const onRenameCollection = (collectionId: string, name: string) => {
    const previousName = collections.find(c => c.id === collectionId)?.name;
    setCollections(prev => prev.map(c => (c.id === collectionId ? { ...c, name } : c)));

    if (!token) return;
    fetch(`${API_BASE_URL}/api/collections/${collectionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    }).then(res => {
      if (!res.ok && previousName !== undefined) {
        console.error('Failed to rename collection: server returned', res.status);
        setCollections(prev => prev.map(c => (c.id === collectionId ? { ...c, name: previousName } : c)));
      }
    }).catch(err => console.error('Failed to rename collection:', err));
  };

  const onDeleteCollection = (collectionId: string) => {
    setCollections(prev => prev.filter(c => c.id !== collectionId));

    if (!token) return;
    fetch(`${API_BASE_URL}/api/collections/${collectionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(err => console.error('Failed to delete collection:', err));
  };

  const onToggleArtworkInCollection = (collectionId: string, artworkId: string) => {
    const collection = collections.find(c => c.id === collectionId);
    const wasInCollection = collection?.artworkIds.includes(artworkId) ?? false;

    setCollections(prev => prev.map(c => {
      if (c.id !== collectionId) return c;
      return {
        ...c,
        artworkIds: wasInCollection
          ? c.artworkIds.filter(id => id !== artworkId)
          : [...c.artworkIds, artworkId],
      };
    }));

    if (!token) return;
    fetch(`${API_BASE_URL}/api/collections/${collectionId}/artworks/${artworkId}`, {
      method: wasInCollection ? 'DELETE' : 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(err => console.error('Failed to sync collection:', err));
  };

  const goToArtwork = (artworkId: string) => {
    const index = artworks.findIndex(a => a.id === artworkId);
    if (index >= 0) setSelectedArtworkIndex(index);
    setPage('portfolio');
  };

  // Liked/saved artworks can belong to anyone, not just the current user -
  // route to the owner's own editable page or the read-only public profile.
  const goToArtworkAnywhere = (artworkId: string, username: string) => {
    if (user && username === user.username) {
      goToArtwork(artworkId);
    } else {
      goToArtworkOnProfile(username, artworkId, 'direct');
    }
  };

  const infoUpdateTimeoutRef = useRef<number | null>(null);

  const onInfoUpdate = (key: keyof ArtworkInfoData, value: string | string[]) => {
    if (selectedArtworkIndex < 0 || selectedArtworkIndex >= artworks.length) return;
    const artwork = artworks[selectedArtworkIndex];

    setArtworks(prev => prev.map(a => (
      a.id === artwork.id ? { ...a, infoData: { ...a.infoData, [key]: value } } : a
    )));

    if (!token) return;

    // Debounce: these fields update on every keystroke, so wait for a pause
    // before persisting instead of firing a request per character typed.
    if (infoUpdateTimeoutRef.current) window.clearTimeout(infoUpdateTimeoutRef.current);
    infoUpdateTimeoutRef.current = window.setTimeout(() => {
      fetch(`${API_BASE_URL}/api/portfolio/artworks/${artwork.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [key]: value }),
      }).catch(err => console.error('Failed to persist artwork info:', err));
    }, 600);
  };

  // Profile is derived directly from the authenticated user - editing it
  // calls the backend (via AuthContext) rather than keeping separate local state.
  const profile: ProfileData = {
    username: user?.username || '',
    avatarUrl: assetUrl(user?.avatarUrl) ?? '/vite.svg',
    title: user?.title || '',
    email: user?.email || '',
    github: user?.github || undefined,
    linkedin: user?.linkedin || undefined,
    bio: user?.bio || undefined,
    skills: user?.skills || [],
    location: user?.location || undefined,
    coverUrl: assetUrl(user?.coverUrl),
    website: user?.website || undefined,
    socialLinks: user?.socialLinks ?? {},
    availableForWork: !!user?.availableForWork,
    workTypes: user?.workTypes ?? [],
    experience: user?.experience ?? [],
  };

  const onProfileChange = (next: ProfileData) => {
    // Only what changed: re-sending untouched fields would re-validate them
    // (e.g. a link saved before links were validated would block every edit).
    const editable = [
      'title', 'bio', 'location', 'github', 'linkedin', 'skills', 'website',
      'socialLinks', 'availableForWork', 'workTypes', 'experience',
    ] as const;
    const changes = Object.fromEntries(
      editable
        .filter(key => JSON.stringify(next[key]) !== JSON.stringify(profile[key]))
        .map(key => [key, next[key]])
    );
    if (Object.keys(changes).length === 0) return;

    updateAuthProfile(changes).catch(err => console.error('Failed to save profile:', err));
  };

  const onCoverChange = (file: File) => {
    uploadCover(file).catch(err => console.error('Failed to upload cover image:', err));
  };

  const onAvatarChange = (file: File) => {
    uploadAvatar(file).catch(err => console.error('Failed to upload avatar:', err));
  };



  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  const goHome = () => setPage('home');
  const goToLogin = () => setPage('login');
  const goToProfile = () => setPage('portfolio');
  const goToLikedPosts = () => setPage('liked-posts');
  const goToMyComments = () => setPage('my-comments');
  const goToSaved = () => setPage('saved');
  const goToSettings = () => setPage('settings');

  if (location.pathname === '/reset-password') {
    const resetToken = new URLSearchParams(location.search).get('token') ?? '';
    return <ResetPasswordPage token={resetToken} onDone={() => navigate(PAGE_PATHS.login, { replace: true })} />;
  }

  if (publicProfileUsername) {
    const viewedProfile: ProfileData | null = publicProfileUser ? {
      username: publicProfileUser.username,
      avatarUrl: assetUrl(publicProfileUser.avatarUrl) ?? '/vite.svg',
      title: publicProfileUser.title || '',
      email: '',
      github: publicProfileUser.github || undefined,
      linkedin: publicProfileUser.linkedin || undefined,
      bio: publicProfileUser.bio || undefined,
      skills: publicProfileUser.skills || [],
      location: publicProfileUser.location || undefined,
      coverUrl: assetUrl(publicProfileUser.coverUrl),
      website: publicProfileUser.website || undefined,
      socialLinks: publicProfileUser.socialLinks ?? {},
      availableForWork: !!publicProfileUser.availableForWork,
      workTypes: publicProfileUser.workTypes ?? [],
      experience: publicProfileUser.experience ?? [],
    } : null;

    return (
      <div className="app-layout" key={publicProfileUsername}>
        <Toolbar
          onLogoClick={goHome}
          onLoginClick={goToLogin}
          onProfileClick={goToProfile}
          onLikedPostsClick={goToLikedPosts}
          onMyCommentsClick={goToMyComments}
          onSavedClick={goToSaved}
          onSettingsClick={goToSettings}
          onSelectUser={goToUserProfile}
          onSelectArtwork={goToArtworkOnProfile}
          showViewModeToggle={false}
        />

        {publicProfileError ? (
          <div className="activity-empty">
            <h3>Couldn't load this profile</h3>
            <p>{publicProfileError}</p>
          </div>
        ) : (
          <>
            <div className="portfolio">
              <div ref={publicSceneContainerRef} className="scene">
                {publicArtworks.some(a => a.publishing?.isMature)
                  && !user?.showMature
                  && matureAcknowledged !== publicProfileUsername && (
                  <div className="mature-gate" role="dialog" aria-label="Mature content warning">
                    <h3>This portfolio contains mature content</h3>
                    <p>Some artworks are marked 18+. You can always show mature content in Settings.</p>
                    <button className="btn primary" onClick={() => setMatureAcknowledged(publicProfileUsername)}>
                      I'm 18 or older - show it
                    </button>
                  </div>
                )}
                <Scene3D
                  artworks={publicArtworks}
                  containerRef={publicSceneContainerRef}
                  onArtworkIndexChange={setPublicSelectedArtworkIndex}
                  onArtworkAdd={onPublicArtworkAdd}
                  editable={false}
                  initialIndex={publicSelectedArtworkIndex}
                  remoteArtworksToLoad={publicRemoteArtworksToLoad}
                />
              </div>

              <ArtworkShowcase
                artworks={publicArtworks}
                selectedIndex={publicSelectedArtworkIndex}
                editable={false}
                onRenderAdd={() => {}}
                onDeleteRender={() => {}}
                onInfoUpdate={() => {}}
                onDeleteArtwork={() => {}}
                likedArtworkIds={likedArtworkIds}
                onToggleLike={onToggleLike}
                commentsByArtwork={commentsByArtwork}
                onAddComment={onAddComment}
                onDeleteComment={onDeleteComment}
                collections={collections}
                onToggleArtworkInCollection={onToggleArtworkInCollection}
                onCreateCollection={onCreateCollection}
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
    return (
      <div className="app-layout single-column">
        <Toolbar
          onLogoClick={goHome}
          onLoginClick={goToLogin}
          onProfileClick={goToProfile}
          showViewModeToggle={false}
        />
        <LoginForm />
      </div>
    );
  }

  if (page === 'portfolio' && user) {
    return (
      <div className="app-layout">
        <Toolbar
          onViewModeChange={handleViewModeChange}
          onSearch={handleSearch}
          onLogoClick={goHome}
          onLoginClick={goToLogin}
          onProfileClick={goToProfile}
          onLikedPostsClick={goToLikedPosts}
          onMyCommentsClick={goToMyComments}
          onSavedClick={goToSaved}
          onSettingsClick={goToSettings}
          onSelectUser={goToUserProfile}
          onSelectArtwork={goToArtworkOnProfile}
        />

        <div className="portfolio">
          <div ref={sceneContainerRef} className="scene">
            <Scene3D
              artworks={artworks}
              containerRef={sceneContainerRef}
              onArtworkIndexChange={setSelectedArtworkIndex}
              onArtworkAdd={onArtworkAdd}
              editable={editable}
              canManage
              initialIndex={selectedArtworkIndex}
              remoteArtworksToLoad={remoteArtworksToLoad}
            />
          </div>


          <ArtworkShowcase
            artworks={artworks}
            selectedIndex={selectedArtworkIndex}
            editable={editable}
            onRenderAdd={onRenderAdd}
            onDeleteRender={onDeleteRender}
            onInfoUpdate={onInfoUpdate}
            onDeleteArtwork={onDeleteArtwork}
            likedArtworkIds={likedArtworkIds}
            onToggleLike={onToggleLike}
            commentsByArtwork={commentsByArtwork}
            onAddComment={onAddComment}
            onDeleteComment={onDeleteComment}
            collections={collections}
            onToggleArtworkInCollection={onToggleArtworkInCollection}
            onCreateCollection={onCreateCollection}
            ownerUsername={user.username}
            onPublishingUpdate={onPublishingUpdate}
          />
        </div>

        <Sidebar
          profile={profile}
          editable={editable}
          onChange={onProfileChange}
          onAvatarUpload={onAvatarChange}
          onCoverUpload={onCoverChange}
        >
          <ProfileSocialBar username={user.username} onOpenUser={goToUserProfile} onRequireLogin={goToLogin} />
        </Sidebar>
      </div>
    );
  }

  if (page === 'liked-posts' && user) {
    return (
      <div className="app-layout single-column">
        <Toolbar
          onLogoClick={goHome}
          onLoginClick={goToLogin}
          onProfileClick={goToProfile}
          onLikedPostsClick={goToLikedPosts}
          onMyCommentsClick={goToMyComments}
          onSavedClick={goToSaved}
          onSettingsClick={goToSettings}
          onSelectUser={goToUserProfile}
          onSelectArtwork={goToArtworkOnProfile}
          showViewModeToggle={false}
        />
        <LikedPostsPage
          likedArtworkIds={likedArtworkIds}
          onSelectArtwork={goToArtworkAnywhere}
        />
      </div>
    );
  }

  if (page === 'my-comments' && user) {
    return (
      <div className="app-layout single-column">
        <Toolbar
          onLogoClick={goHome}
          onLoginClick={goToLogin}
          onProfileClick={goToProfile}
          onLikedPostsClick={goToLikedPosts}
          onMyCommentsClick={goToMyComments}
          onSavedClick={goToSaved}
          onSettingsClick={goToSettings}
          onSelectUser={goToUserProfile}
          onSelectArtwork={goToArtworkOnProfile}
          showViewModeToggle={false}
        />
        <MyCommentsPage
          commentsByArtwork={commentsByArtwork}
          currentUserName={user.username}
          onSelectArtwork={goToArtworkAnywhere}
        />
      </div>
    );
  }

  if (page === 'saved' && user) {
    return (
      <div className="app-layout single-column">
        <Toolbar
          onLogoClick={goHome}
          onLoginClick={goToLogin}
          onProfileClick={goToProfile}
          onLikedPostsClick={goToLikedPosts}
          onMyCommentsClick={goToMyComments}
          onSavedClick={goToSaved}
          onSettingsClick={goToSettings}
          onSelectUser={goToUserProfile}
          onSelectArtwork={goToArtworkOnProfile}
          showViewModeToggle={false}
        />
        <SavedPage
          collections={collections}
          onCreateCollection={onCreateCollection}
          onRenameCollection={onRenameCollection}
          onDeleteCollection={onDeleteCollection}
          onSelectArtwork={goToArtworkAnywhere}
        />
      </div>
    );
  }

  // Toolbar + one full-width page (the standalone community pages).
  const singleColumnPage = (content: React.ReactNode) => (
    <div className="app-layout single-column">
      <Toolbar
        onLogoClick={goHome}
        onLoginClick={goToLogin}
        onProfileClick={goToProfile}
        onLikedPostsClick={goToLikedPosts}
        onMyCommentsClick={goToMyComments}
        onSavedClick={goToSaved}
        onSettingsClick={goToSettings}
        onSelectUser={goToUserProfile}
        onSelectArtwork={goToArtworkOnProfile}
        showViewModeToggle={false}
      />
      {content}
    </div>
  );

  // Opens an artwork from a community page, recording where it came from.
  const openArtworkFrom = (source: ViewSource) => (username: string, artworkId: string) => {
    if (user && username === user.username) goToArtwork(artworkId);
    else goToArtworkOnProfile(username, artworkId, source);
  };

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
    return (
      <div className="app-layout single-column">
        <Toolbar
          onLogoClick={goHome}
          onLoginClick={goToLogin}
          onProfileClick={goToProfile}
          onLikedPostsClick={goToLikedPosts}
          onMyCommentsClick={goToMyComments}
          onSavedClick={goToSaved}
          onSettingsClick={goToSettings}
          onSelectUser={goToUserProfile}
          onSelectArtwork={goToArtworkOnProfile}
          showViewModeToggle={false}
        />
        <SettingsPage />
      </div>
    );
  }

  return (
    <div className="app-layout single-column">
      <Toolbar
        onLogoClick={goHome}
        onLoginClick={goToLogin}
        onProfileClick={goToProfile}
        onLikedPostsClick={goToLikedPosts}
        onMyCommentsClick={goToMyComments}
        onSavedClick={goToSaved}
        onSettingsClick={goToSettings}
        onSelectUser={goToUserProfile}
        onSelectArtwork={goToArtworkOnProfile}
        showViewModeToggle={false}
      />
      <ExplorePage
        onOpenArtwork={(username, artworkId, source) => {
          if (user && username === user.username) goToArtwork(artworkId);
          else goToArtworkOnProfile(username, artworkId, source);
        }}
        onOpenUser={goToUserProfile}
      />
    </div>
  );
}

export default App;