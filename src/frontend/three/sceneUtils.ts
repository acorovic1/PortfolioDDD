import * as THREE from 'three';
import type { PortfolioPiece } from '@/types/PortfolioPiece';
import type { ArtworkInfoData } from '@/types/ArtworkInfoData';

export const DEFAULT_CAMERA_NEAR = 0.1;
export const DEFAULT_CAMERA_FAR = 1000;

export function modelSize(piece: PortfolioPiece): number {
  return piece.bounds.getSize(new THREE.Vector3()).length();
}

// Camera distance at which the whole model fits the view with a little margin.
export function inspectionDistance(piece: PortfolioPiece, camera: THREE.PerspectiveCamera): number {
  const radius = Math.max(modelSize(piece) / 2, 0.01);
  return radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2);
}

// Fit the clipping planes to the model while inspecting it: depth precision
// with a fixed 0.1-1000 range is too coarse for very large or very small
// models, which breaks depth-based effects like ambient occlusion.
export function fitCameraClipping(camera: THREE.PerspectiveCamera, distance: number): void {
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
}

export function resetCameraClipping(camera: THREE.PerspectiveCamera): void {
  camera.near = DEFAULT_CAMERA_NEAR;
  camera.far = DEFAULT_CAMERA_FAR;
  camera.updateProjectionMatrix();
}

// Pointer position over `element` in normalized device coordinates (-1..1,
// +y up), as raycasting expects.
export function pointerToNdc(event: MouseEvent, element: HTMLElement, out = new THREE.Vector2()): THREE.Vector2 {
  const rect = element.getBoundingClientRect();
  return out.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
}

export function countVertices(piece?: PortfolioPiece): number {
  if (!piece) return 0;
  let count = 0;
  piece.root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      count += mesh.geometry.attributes.position?.count ?? 0;
    }
  });
  return count;
}

// Frees the GPU resources (geometry, materials) of everything under `object`.
// Objects that own more (e.g. a 2D artwork's textures) free it in
// `userData.onDispose`.
export function disposeObject(object: THREE.Object3D): void {
  object.traverse((obj) => {
    (obj.userData.onDispose as (() => void) | undefined)?.();
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach(m => m.dispose());
    else material?.dispose();
  });
}

// The yellow sphere in the middle of the carousel that adds a new model in
// edit mode. Shaped like a piece so it can share the raycasting helpers.
export function createAddButton(): PortfolioPiece {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffff00 })
  ));

  const infoData: ArtworkInfoData = {
    title: 'Add Button',
    description: '',
    tools: [],
    year: '',
    category: '',
    tags: [],
  };

  return {
    id: 'addButton',
    root: group,
    bounds: new THREE.Box3().setFromObject(group),
    infoData,
    renders: [],
    likeCount: 0,
    animations: [],
  };
}
