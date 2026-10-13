import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { API_BASE_URL } from '@/frontend/config/api';
import type { PortfolioPiece } from '@/types/PortfolioPiece';
import { hasOwnLights } from '@/frontend/three/lightLinking';

const SIZE = 512;

// Renders a 3/4 studio view of a model to an image, using a short-lived
// offscreen renderer (the model is cloned, so the live scene is untouched).
export async function renderModelThumbnail(piece: PortfolioPiece): Promise<Blob | null> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04).texture;
  scene.environment = environment;

  // The piece's root is rotated to face the carousel center; its child (the
  // loaded model) is already centered on the origin in model space.
  const model = cloneSkinned(piece.root.children[0] ?? piece.root);
  scene.add(model);

  // A model with its own lights is shown in them alone, as in the scene.
  if (!hasOwnLights(model)) {
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(3, 5, 4);
    scene.add(key);
  }

  const radius = Math.max(piece.bounds.getSize(new THREE.Vector3()).length() / 2, 0.001);
  const camera = new THREE.PerspectiveCamera(35, 1, radius / 100, radius * 100);
  const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2);
  camera.position.set(1, 0.6, 1).normalize().multiplyScalar(distance);
  camera.lookAt(0, 0, 0);
  // The clone keeps the layer the scene gave it (lightLinking.ts).
  camera.layers.enableAll();

  try {
    renderer.render(scene, camera);
    return await new Promise<Blob | null>((resolve) => {
      renderer.domElement.toBlob(resolve, 'image/webp', 0.9);
    });
  } finally {
    environment.dispose();
    room.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

// Renders and uploads the thumbnail; failures are logged, never thrown -
// a missing thumbnail only means cards fall back to an icon.
export async function uploadModelThumbnail(piece: PortfolioPiece, token: string): Promise<string | null> {
  try {
    const blob = await renderModelThumbnail(piece);
    if (!blob) return null;

    const formData = new FormData();
    formData.append('image', blob, blob.type === 'image/webp' ? 'thumbnail.webp' : 'thumbnail.png');

    const res = await fetch(`${API_BASE_URL}/api/portfolio/artworks/${piece.id}/thumbnail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    return ((await res.json()) as { thumbnailUrl: string }).thumbnailUrl;
  } catch (error) {
    console.error('Failed to generate a model thumbnail:', error);
    return null;
  }
}
