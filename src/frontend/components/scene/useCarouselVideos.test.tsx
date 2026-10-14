import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as THREE from 'three';
import { useCarouselVideos } from './useCarouselVideos';
import { DEFAULT_CANVAS } from '@/frontend/three/easelCanvas';
import type { PortfolioPiece } from '@/types/PortfolioPiece';

function fakeVideo() {
  const element = document.createElement('video');
  let paused = true;
  Object.defineProperty(element, 'paused', { configurable: true, get: () => paused });
  element.play = vi.fn(() => { paused = false; return Promise.resolve(); });
  element.pause = vi.fn(() => { paused = true; });
  return element;
}

function piece(id: string, video: boolean): PortfolioPiece {
  return {
    id,
    root: new THREE.Group(),
    bounds: new THREE.Box3(),
    infoData: { title: id, description: '', tools: [], year: '', category: '', tags: [] },
    renders: [],
    likeCount: 0,
    animations: [],
    image: video
      ? { url: `/uploads/videos/${id}.mp4`, width: 1920, height: 1080, canvas: DEFAULT_CANVAS, video: { element: fakeVideo(), duration: 10, posterUrl: null } }
      : undefined,
  };
}

const element = (p: PortfolioPiece) => p.image!.video!.element;

describe('useCarouselVideos', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia;
  });

  it('plays only the video in front', () => {
    const a = piece('a', true);
    const b = piece('b', true);
    const model = piece('m', false);
    const artworks = [a, b, model];
    let front: PortfolioPiece = a;

    const { result, rerender } = renderHook(
      ({ frontIndex }) => useCarouselVideos({ artworks, frontPiece: () => front, frontIndex, active: true }),
      { initialProps: { frontIndex: 0 } },
    );
    expect(element(a).paused).toBe(false);
    expect(element(b).paused).toBe(true);
    expect(result.current.frontVideo?.playing).toBe(true);

    // The carousel turns: the new front plays, the old one stops.
    front = b;
    rerender({ frontIndex: 1 });
    expect(element(a).paused).toBe(true);
    expect(element(b).paused).toBe(false);

    // A model in front: nothing plays, and there's no video toggle.
    front = model;
    rerender({ frontIndex: 2 });
    expect(element(b).paused).toBe(true);
    expect(result.current.frontVideo).toBeNull();
  });

  it('matches the front piece by id, not by object', () => {
    const a = piece('a', true);
    // The parent's state holds a copy (e.g. after an update spread it).
    const copy = { ...a, likeCount: 1 };
    renderHook(() => useCarouselVideos({ artworks: [copy], frontPiece: () => a, frontIndex: 0, active: true }));
    expect(element(a).paused).toBe(false);
  });

  it('lets the visitor pause and resume the front video, and remembers it', () => {
    const a = piece('a', true);
    const b = piece('b', true);
    let front: PortfolioPiece = a;
    const { result, rerender } = renderHook(
      ({ frontIndex }) => useCarouselVideos({ artworks: [a, b], frontPiece: () => front, frontIndex, active: true }),
      { initialProps: { frontIndex: 0 } },
    );

    act(() => result.current.frontVideo!.toggle());
    expect(element(a).paused).toBe(true);
    expect(result.current.frontVideo?.playing).toBe(false);

    // Away and back: still paused, as they left it.
    front = b;
    rerender({ frontIndex: 1 });
    front = a;
    rerender({ frontIndex: 0 });
    expect(element(a).paused).toBe(true);

    act(() => result.current.frontVideo!.toggle());
    expect(element(a).paused).toBe(false);
  });

  it('stops while an artwork is open in focus mode, and when the scene goes away', () => {
    const a = piece('a', true);
    const { rerender, unmount } = renderHook(
      ({ active }) => useCarouselVideos({ artworks: [a], frontPiece: () => a, frontIndex: 0, active }),
      { initialProps: { active: true } },
    );
    expect(element(a).paused).toBe(false);

    rerender({ active: false });
    expect(element(a).paused).toBe(true);
    rerender({ active: true });
    expect(element(a).paused).toBe(false);

    unmount();
    expect(element(a).paused).toBe(true);
  });

  it('waits for play when reduced motion is asked for', () => {
    window.matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia;
    const a = piece('a', true);
    const { result } = renderHook(() => useCarouselVideos({ artworks: [a], frontPiece: () => a, frontIndex: 0, active: true }));
    expect(element(a).paused).toBe(true);

    act(() => result.current.frontVideo!.toggle());
    expect(element(a).paused).toBe(false);
  });
});
