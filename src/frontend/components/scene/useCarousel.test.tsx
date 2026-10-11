import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCarousel, useFollowRequestedIndex } from './useCarousel';
import { snapCarousel, stepCarousel } from '@/frontend/three/carousel';
import { cubePiece } from '@/frontend/three/testPieces';

function setup(count = 3, initialIndex = 0) {
  const pieces = Array.from({ length: count }, (_, i) => cubePiece(`p${i}`));
  const animateCameraTo = vi.fn();
  const onIndexChange = vi.fn();
  const hook = renderHook(() => useCarousel({ initialIndex, onIndexChange, animateCameraTo }));
  hook.result.current.artworksRef.current.push(...pieces);
  snapCarousel(pieces, 0, hook.result.current.radiusRef.current);
  return { ...hook, pieces, animateCameraTo, onIndexChange };
}

const settle = (pieces: ReturnType<typeof cubePiece>[]) => {
  for (let i = 0; i < 300; i++) stepCarousel(pieces);
};

describe('useCarousel', () => {
  it('rotates one step each way, reporting the new front and framing it', () => {
    const { result, pieces, animateCameraTo, onIndexChange } = setup();

    act(() => result.current.rotate(-1));
    expect(result.current.frontIndex).toBe(1);
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
    expect(animateCameraTo).toHaveBeenLastCalledWith(pieces[1]);
    settle(pieces);
    expect(result.current.frontPiece()).toBe(pieces[1]);

    act(() => result.current.rotate(1));
    act(() => result.current.rotate(1));
    expect(result.current.frontIndex).toBe(2);
    settle(pieces);
    expect(result.current.frontPiece()).toBe(pieces[2]);
  });

  it('jumps straight to an index', () => {
    const { result, pieces } = setup(5);

    act(() => result.current.goToIndex(3));
    expect(result.current.frontIndex).toBe(3);
    expect(result.current.frontPiece()).toBe(pieces[3]); // already, from the targets
  });

  it('ignores out-of-range jumps and rotating an empty carousel', () => {
    const { result, animateCameraTo } = setup(2);
    act(() => result.current.goToIndex(5));
    expect(result.current.frontIndex).toBe(0);

    const empty = renderHook(() => useCarousel({ initialIndex: 0, animateCameraTo }));
    act(() => empty.result.current.rotate(1));
    expect(empty.result.current.frontIndex).toBe(0);
    expect(animateCameraTo).not.toHaveBeenCalled();
  });

  it('centers the camera on the front artwork', () => {
    const { result, pieces, animateCameraTo } = setup();
    act(() => result.current.centerOnFront());
    expect(animateCameraTo).toHaveBeenCalledWith(pieces[0]);
  });
});

describe('useFollowRequestedIndex', () => {
  it('brings a requested artwork to the front once it is in the scene', () => {
    const pieces = ['a', 'b', 'c'].map(id => cubePiece(id));
    const animateCameraTo = vi.fn();

    const { result, rerender } = renderHook(({ artworks, index }) => {
      const carousel = useCarousel({ initialIndex: index, animateCameraTo });
      useFollowRequestedIndex(carousel, artworks, index);
      return carousel;
    }, { initialProps: { artworks: pieces.slice(0, 1), index: 2 } });

    // Not loaded yet: nothing to do.
    expect(animateCameraTo).not.toHaveBeenCalled();

    result.current.artworksRef.current.push(...pieces);
    snapCarousel(pieces, 0, 3);
    rerender({ artworks: pieces, index: 2 });

    expect(result.current.frontPiece()).toBe(pieces[2]);
    expect(animateCameraTo).toHaveBeenCalledWith(pieces[2]);
  });
});
