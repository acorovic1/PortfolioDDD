import { describe, it, expect, vi, afterEach } from 'vitest';
import type { LoginCarousel } from './loginCarousel';
import { handOffBackdrop, takeBackdrop } from './backdropHandoff';

function scene() {
  return {
    canvas: document.createElement('canvas'),
    carousel: { dispose: vi.fn() } as unknown as LoginCarousel,
  };
}

afterEach(() => {
  takeBackdrop();
  vi.useRealTimers();
});

describe('backdrop handoff', () => {
  it('passes the running scene to the next page', () => {
    const left = scene();
    handOffBackdrop(left, 'landing');

    const taken = takeBackdrop();
    expect(taken?.canvas).toBe(left.canvas);
    expect(taken?.from).toBe('landing');
    expect(left.carousel.dispose).not.toHaveBeenCalled();
    expect(takeBackdrop()).toBeNull();
  });

  it('disposes a scene nobody picks up', () => {
    vi.useFakeTimers();
    const left = scene();
    handOffBackdrop(left, 'login');

    vi.advanceTimersByTime(2000);
    expect(left.carousel.dispose).toHaveBeenCalledOnce();
    expect(takeBackdrop()).toBeNull();
  });

  it('replaces (and disposes) an older scene that was never taken', () => {
    const older = scene();
    handOffBackdrop(older, 'landing');
    handOffBackdrop(scene(), 'login');

    expect(older.carousel.dispose).toHaveBeenCalledOnce();
    expect(takeBackdrop()?.from).toBe('login');
  });
});
