import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { BackdropOwner } from '@/frontend/three/backdropHandoff';

const DURATION_MS = 700;
const EASING = 'cubic-bezier(0.65, 0, 0.35, 1)';
const RADIUS = '16px';

export type HeroTransition = {
  // Grows the hero carousel to fill the page, then calls `onEntered`.
  enter: (signup: boolean) => void;
};

type Box = { left: number; top: number; width: number; height: number };

const boxOf = (el: Element): Box => {
  const { left, top, width, height } = el.getBoundingClientRect();
  return { left, top, width, height };
};

const keyframe = (box: Box, radius: string): Keyframe => ({
  left: `${box.left}px`,
  top: `${box.top}px`,
  width: `${box.width}px`,
  height: `${box.height}px`,
  borderRadius: radius,
});

// Takes the stage out of the layout, over the page, at `box`.
function pin(stage: HTMLElement, box: Box, radius: string): void {
  Object.assign(stage.style, keyframe(box, radius), { position: 'fixed', zIndex: '20' });
}

function unpin(stage: HTMLElement): void {
  for (const prop of ['position', 'zIndex', 'left', 'top', 'width', 'height', 'borderRadius'] as const) {
    stage.style[prop] = '';
  }
}

// No animation for people who asked for less motion, or without the Web
// Animations API.
const skipAnimation = () =>
  (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) || typeof Element.prototype.animate !== 'function';

type HeroTransitionOptions = {
  // The page (its box is where the login page's backdrop will be) and the
  // hero's placeholder (where the carousel sits) and stage (what moves).
  pageRef: RefObject<HTMLElement | null>;
  placeholderRef: RefObject<HTMLElement | null>;
  stageRef: RefObject<HTMLElement | null>;
  onEntered: (signup: boolean) => void;
};

// The hero carousel grows into the login page's full-page backdrop on the
// way in, and shrinks back into place on the way back from the login page.
// The 3D scene itself is handed between the pages (backdropHandoff.ts), so it
// keeps running throughout.
export function useHeroTransition({ pageRef, placeholderRef, stageRef, onEntered }: HeroTransitionOptions): {
  transition: HeroTransition;
  leaving: boolean;
  returning: boolean;
  // Pass to the hero's LoginBackdrop: a scene handed over by the login page
  // means we're coming back from it.
  onBackdropAdopted: (from: BackdropOwner | null) => void;
} {
  const [leaving, setLeaving] = useState(false);
  const [returning, setReturning] = useState(false);
  const leavingRef = useRef(false);

  // A scene handed over by the login page means we're coming back from it.
  // This is reported from the carousel's own layout effect, before this
  // page's elements are attached, so the animation starts below.
  const onBackdropAdopted = (from: BackdropOwner | null) => {
    if (from === 'login' && !skipAnimation()) setReturning(true);
  };

  // Shrinks the full-page carousel back into the hero, before the first paint.
  useLayoutEffect(() => {
    const page = pageRef.current;
    const placeholder = placeholderRef.current;
    const stage = stageRef.current;
    if (!returning || !page || !placeholder || !stage) return;

    pin(stage, boxOf(page), '0px');
    const animation = stage.animate(
      [keyframe(boxOf(page), '0px'), keyframe(boxOf(placeholder), RADIUS)],
      { duration: DURATION_MS, easing: EASING, fill: 'forwards' }
    );
    animation.finished.then(() => setReturning(false)).catch(() => {});
    return () => {
      animation.cancel();
      unpin(stage);
    };
  }, [returning, pageRef, placeholderRef, stageRef]);

  const enter = (signup: boolean) => {
    const page = pageRef.current;
    const placeholder = placeholderRef.current;
    const stage = stageRef.current;
    if (leavingRef.current) return;
    if (!page || !placeholder || !stage || skipAnimation()) {
      onEntered(signup);
      return;
    }
    leavingRef.current = true;
    setLeaving(true);

    // Start from where the hero is, kept out from under the toolbar if the
    // page has been scrolled.
    const pageBox = boxOf(page);
    const hero = boxOf(placeholder);
    const top = Math.max(hero.top, pageBox.top);
    const from = { ...hero, top, height: Math.max(hero.top + hero.height - top, 1) };

    pin(stage, from, RADIUS);
    const animation = stage.animate(
      [keyframe(from, RADIUS), keyframe(pageBox, '0px')],
      { duration: DURATION_MS, easing: EASING, fill: 'forwards' }
    );
    animation.finished.then(() => onEntered(signup)).catch(() => {});
  };

  return { transition: { enter }, leaving, returning, onBackdropAdopted };
}
