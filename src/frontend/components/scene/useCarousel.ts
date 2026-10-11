import { useEffect, useRef, useState } from 'react';
import type { PortfolioPiece } from '@/types/PortfolioPiece';
import { frontPieceId, rotateCarouselTo, shiftCarousel } from '@/frontend/three/carousel';

type CarouselOptions = {
  initialIndex: number;
  onIndexChange?: (index: number) => void;
  animateCameraTo: (piece: PortfolioPiece) => void;
};

// Which artwork is in front, and moving the carousel between them.
export function useCarousel({ initialIndex, onIndexChange, animateCameraTo }: CarouselOptions) {
  // Pieces currently in the scene, in carousel order. Kept apart from the
  // `artworks` prop because loads land here before the parent re-renders.
  const artworksRef = useRef<PortfolioPiece[]>([]);
  const radiusRef = useRef(3);
  const [frontIndex, setFrontIndex] = useState(initialIndex);

  useEffect(() => {
    onIndexChange?.(frontIndex);
  }, [frontIndex, onIndexChange]);

  const frontPiece = (): PortfolioPiece | undefined => {
    const id = frontPieceId(artworksRef.current);
    return artworksRef.current.find(p => p.id === id);
  };

  // Rotate the carousel so an arbitrary artwork lands front-center, then
  // focus the camera on it - used to jump straight to a specific artwork
  // (e.g. deep-linking from Liked/Saved) rather than stepping one at a time.
  const goToIndex = (index: number) => {
    const pieces = artworksRef.current;
    if (index < 0 || index >= pieces.length) return;
    rotateCarouselTo(pieces, index, radiusRef.current);
    setFrontIndex(index);
    animateCameraTo(pieces[index]);
  };

  // One step around: 1 = clockwise, -1 = counter-clockwise.
  const rotate = (step: 1 | -1) => {
    const pieces = artworksRef.current;
    if (pieces.length === 0) return;
    shiftCarousel(pieces, step);
    const newFrontIndex = (frontIndex - step + pieces.length) % pieces.length;
    setFrontIndex(newFrontIndex);
    animateCameraTo(pieces[newFrontIndex]);
  };

  const centerOnFront = () => {
    const piece = artworksRef.current[frontIndex];
    if (piece) animateCameraTo(piece);
  };

  return { artworksRef, radiusRef, frontIndex, setFrontIndex, frontPiece, goToIndex, rotate, centerOnFront };
}

export type Carousel = ReturnType<typeof useCarousel>;

// Call after the artworks prop has been synced into the carousel, so a
// requested artwork that's already loaded is found on the first pass.
export function useFollowRequestedIndex(carousel: Carousel, artworks: PortfolioPiece[], initialIndex: number) {
  const { artworksRef, frontIndex, goToIndex } = carousel;
  // Keep the carousel's front-facing artwork in sync with the selected index
  // whenever it points at a different artwork than what's actually front -
  // covers both a deep link resolving once its artwork loads, and jumping
  // straight to an artwork on a remount that already has it loaded.
  //
  // Only an index the parent *asked for* is acted on: after a local change
  // (adding/rotating) the parent briefly still holds the previous index, and
  // obeying that stale value would rotate back, report it, get the new value
  // echoed... ping-ponging forever.
  const handledInitialIndexRef = useRef<number | null>(null);
  useEffect(() => {
    const parentRequested = handledInitialIndexRef.current !== initialIndex;
    if (!parentRequested && initialIndex !== frontIndex) return; // parent hasn't caught up yet

    const targetId = artworks[initialIndex]?.id;
    if (!targetId) return;

    const targetRefIndex = artworksRef.current.findIndex(p => p.id === targetId);
    if (targetRefIndex === -1) return; // not loaded into the scene yet

    handledInitialIndexRef.current = initialIndex;
    if (frontPieceId(artworksRef.current) === targetId) return;
    goToIndex(targetRefIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIndex, artworks]);
}
