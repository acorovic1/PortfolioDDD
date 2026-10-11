import * as THREE from 'three';
import type { PortfolioPiece } from '@/types/PortfolioPiece';
import { modelSize } from './sceneUtils';

export type CameraAnimation = {
  startTime: number;
  duration: number;
  fromCameraPosition: THREE.Vector3;
  toCameraPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
};

export type CameraFraming = { distance?: number; direction?: THREE.Vector3 };

export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Eases the camera/orbit target toward `piece` at a medium distance scaled
// to its size, over ~1s, keeping the current viewing angle. Aims at the
// piece's pending targetPosition (if it's mid-rotation) so the camera
// arrives together with the object, otherwise its current position.
// `framing` overrides that: the inspector frames the model tightly and
// "reset camera" restores a specific viewing direction.
export function cameraAnimationTo(
  piece: PortfolioPiece,
  cameraPosition: THREE.Vector3,
  orbitTarget: THREE.Vector3,
  framing: CameraFraming = {},
  now = performance.now()
): CameraAnimation {
  const focusPosition: THREE.Vector3 =
    (piece.root.userData.targetPosition as THREE.Vector3 | undefined)?.clone()
    ?? piece.root.position.clone();

  const distance = framing.distance ?? Math.max(6, modelSize(piece) * 1.8);

  const direction = framing.direction?.clone() ?? cameraPosition.clone().sub(orbitTarget);
  if (direction.lengthSq() === 0) direction.set(0, 0, 1);
  direction.normalize().multiplyScalar(distance);

  return {
    startTime: now,
    duration: 1000,
    fromCameraPosition: cameraPosition.clone(),
    toCameraPosition: focusPosition.clone().add(direction),
    fromTarget: orbitTarget.clone(),
    toTarget: focusPosition,
  };
}

// Moves the camera position and orbit target (in place) to where the
// animation is at `now`. Returns true once it has finished.
export function stepCameraAnimation(
  animation: CameraAnimation,
  cameraPosition: THREE.Vector3,
  orbitTarget: THREE.Vector3,
  now: number
): boolean {
  const t = Math.min((now - animation.startTime) / animation.duration, 1);
  const eased = easeInOutQuad(t);
  cameraPosition.lerpVectors(animation.fromCameraPosition, animation.toCameraPosition, eased);
  orbitTarget.lerpVectors(animation.fromTarget, animation.toTarget, eased);
  return t >= 1;
}
