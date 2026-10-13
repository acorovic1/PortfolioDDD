import type { LoginCarousel } from './loginCarousel';

// The landing page's hero and the login page show the same 3D carousel. When
// one page gives way to the other, the running scene (canvas, WebGL context
// and all) is handed over instead of being torn down and rebuilt, so the
// carousel keeps turning through the transition. A scene nobody picks up
// shortly after is disposed.

export type BackdropOwner = 'landing' | 'login';

export type BackdropScene = {
  canvas: HTMLCanvasElement;
  carousel: LoginCarousel;
};

type Pending = BackdropScene & { from: BackdropOwner; timer: ReturnType<typeof setTimeout> };

// Long enough for the next page to mount, short enough not to hold a WebGL
// context for a page that never comes.
const UNCLAIMED_MS = 1500;

let pending: Pending | null = null;

function discard(): void {
  if (!pending) return;
  clearTimeout(pending.timer);
  pending.canvas.remove();
  pending.carousel.dispose();
  pending = null;
}

export function handOffBackdrop(scene: BackdropScene, from: BackdropOwner): void {
  discard();
  pending = { ...scene, from, timer: setTimeout(discard, UNCLAIMED_MS) };
}

// The scene a page left behind, and which page that was.
export function takeBackdrop(): (BackdropScene & { from: BackdropOwner }) | null {
  if (!pending) return null;
  clearTimeout(pending.timer);
  const { canvas, carousel, from } = pending;
  pending = null;
  return { canvas, carousel, from };
}
