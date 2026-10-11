import * as THREE from 'three';
import type { ViewerSettings } from '@/frontend/inspector/PostProcessing';

export type SavedCamera = NonNullable<ViewerSettings['camera']>;

const round = (n: number) => Math.round(n * 10_000) / 10_000;

// An artist's saved camera is stored in the model's own frame (so the angle
// doesn't depend on where the carousel happens to have rotated it), with the
// zoom relative to the distance that just fits the model in view.
export function toSavedCamera(
  offset: THREE.Vector3,
  modelRotation: THREE.Quaternion,
  fitDistance: number
): SavedCamera {
  const local = offset.clone().normalize().applyQuaternion(modelRotation.clone().invert());
  return {
    direction: [round(local.x), round(local.y), round(local.z)],
    distanceFactor: Math.min(20, Math.max(0.05, round(offset.length() / fitDistance))),
  };
}

// The world-space viewing direction (normalized) and distance for a saved camera.
export function fromSavedCamera(
  saved: SavedCamera,
  modelRotation: THREE.Quaternion,
  fitDistance: number
): { direction: THREE.Vector3; distance: number } {
  const direction = new THREE.Vector3(...saved.direction).applyQuaternion(modelRotation);
  if (direction.lengthSq() === 0) direction.set(0, 0, 1);
  return { direction: direction.normalize(), distance: fitDistance * saved.distanceFactor };
}
