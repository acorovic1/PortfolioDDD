import { useEffect, useRef, useState } from 'react';
import type { PortfolioPiece } from '@/types/PortfolioPiece';

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

type CarouselVideosOptions = {
  artworks: PortfolioPiece[];
  // The carousel's front piece. Read after rendering: the carousel takes in
  // new pieces in an effect, so call this hook after that effect.
  frontPiece: () => PortfolioPiece | undefined;
  // Re-evaluated when the carousel turns.
  frontIndex: number;
  // False while an artwork is open in focus mode (which plays its own copy).
  active: boolean;
};

// Video artworks in the carousel: only the one in front plays (muted,
// looping), the others hold their frame. A visitor can pause and resume
// the front one; that choice sticks to the video while they're here. With
// reduced motion asked for, videos wait for a press of play.
export function useCarouselVideos({ artworks, frontPiece, frontIndex, active }: CarouselVideosOptions) {
  // Video id -> whether the visitor wants it playing (absent = the default).
  const [choices, setChoices] = useState<Map<string, boolean>>(() => new Map());
  const [autoplay] = useState(() => !prefersReducedMotion());
  // The front artwork's id when it's a video.
  const [frontVideoId, setFrontVideoId] = useState<string | null>(null);

  useEffect(() => {
    const front = frontPiece();
    const videoId = front?.image?.video ? front.id : null;
    setFrontVideoId(videoId);
    for (const piece of artworks) {
      const element = piece.image?.video?.element;
      if (!element) continue;
      // By id: the parent's copies of a piece aren't always the carousel's
      // objects (updates spread them into new ones).
      const shouldPlay = active && piece.id === videoId && (choices.get(piece.id) ?? autoplay);
      if (shouldPlay && element.paused) element.play().catch(() => {});
      else if (!shouldPlay && !element.paused) element.pause();
    }
    // frontPiece reads the carousel's ref, which `artworks`/`frontIndex`
    // changes keep current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artworks, frontIndex, active, choices, autoplay]);

  // The pieces outlive the scene (they stay in React state while the visitor
  // is on another page): stop every video when it unmounts.
  const artworksRef = useRef(artworks);
  useEffect(() => { artworksRef.current = artworks; }, [artworks]);
  useEffect(() => () => {
    artworksRef.current.forEach(piece => piece.image?.video?.element.pause());
  }, []);

  const playing = frontVideoId !== null && (choices.get(frontVideoId) ?? autoplay);
  const toggleFront = () => {
    if (frontVideoId === null) return;
    setChoices(prev => new Map(prev).set(frontVideoId, !playing));
  };

  return {
    // The front artwork's video, when it is one: whether it's meant to be
    // playing, and the pause/resume toggle.
    frontVideo: frontVideoId !== null ? { playing, toggle: toggleFront } : null,
  };
}
