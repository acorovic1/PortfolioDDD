import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Theme } from '@/frontend/contexts/theme-context';

// The default surroundings for viewing models: a soft gradient backdrop that
// follows the site theme, studio environment lighting, and a floor under the
// models with a contact shadow beneath each one. The floor and shadows live
// outside the models themselves, so picking, inspector view modes and model
// stats never see them.

// What the scene falls back to when the inspector isn't overriding it.
export type SceneDefaults = {
  background: THREE.Texture | null;
  environment: THREE.Texture | null;
  toneMapping: THREE.ToneMapping;
};

// Something standing on the floor: a root object plus its bounds in the
// root's own space.
export type StageSubject = { root: THREE.Object3D; bounds: THREE.Box3 };

export type StudioStage = SceneDefaults & {
  setTheme(theme: Theme): void;
  // Call once per frame: puts the floor under the lowest visible subject and
  // a shadow under each one.
  update(subjects: StageSubject[]): void;
  dispose(): void;
};

type Palette = {
  skyTop: string;
  skyHorizon: string;
  skyBottom: string;
  // Pool of light on the floor under the models, fading out at its edge.
  floor: string;
  floorOpacity: number;
  shadowOpacity: number;
};

// Neutral, slightly cool greys, so they don't tint the artists' work.
const PALETTES: Record<Theme, Palette> = {
  dark: { skyTop: '#121218', skyHorizon: '#1e1e27', skyBottom: '#0a0a0d', floor: '#2a2a35', floorOpacity: 0.85, shadowOpacity: 0.75 },
  light: { skyTop: '#f6f6f9', skyHorizon: '#ececf1', skyBottom: '#d9d9e0', floor: '#ffffff', floorOpacity: 0.9, shadowOpacity: 0.4 },
};

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function backdropTexture(palette: Palette): THREE.Texture {
  return canvasTexture(2, 256, ctx => {
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, palette.skyTop);
    gradient.addColorStop(0.55, palette.skyHorizon);
    gradient.addColorStop(1, palette.skyBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 256);
  });
}

function floorTexture(palette: Palette): THREE.Texture {
  return canvasTexture(256, 256, ctx => {
    const color = new THREE.Color(palette.floor).getHexString();
    const rgb = [0, 2, 4].map(i => parseInt(color.slice(i, i + 2), 16)).join(',');
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, `rgba(${rgb},${palette.floorOpacity})`);
    gradient.addColorStop(0.5, `rgba(${rgb},${palette.floorOpacity * 0.6})`);
    gradient.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
  });
}

function shadowTexture(): THREE.Texture {
  return canvasTexture(128, 128, ctx => {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(0,0,0,0.8)');
    gradient.addColorStop(0.5, 'rgba(0,0,0,0.35)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  });
}

// Never hit by pointer picking.
const noRaycast = () => {};

// How a subject's shadow looks for its size and height above the floor:
// right under it, it's a tight dark patch; the higher the subject floats, the
// wider and fainter it gets.
export function shadowShape(footprint: number, height: number, gap: number): { size: number; strength: number } {
  const lift = gap / Math.max(height, 1e-6);
  return { size: footprint * (1.15 + lift * 0.6), strength: 1 / (1 + lift * 2.5) };
}

export function createStudioStage(renderer: THREE.WebGLRenderer, scene: THREE.Scene): StudioStage {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();

  const group = new THREE.Group();
  group.name = 'studio-stage';
  scene.add(group);

  // Unlit and not tone mapped, so the floor's edge melts into the backdrop.
  const floorMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 64), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.renderOrder = -2;
  floor.raycast = noRaycast;
  group.add(floor);

  const shadowMap = shadowTexture();
  const shadowGeometry = new THREE.PlaneGeometry(1, 1);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadows = new Map<THREE.Object3D, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>();
  let shadowOpacity = 1;

  const worldBox = new THREE.Box3();
  const allBox = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  const stage: StudioStage = {
    background: null,
    environment,
    toneMapping: THREE.ACESFilmicToneMapping,

    setTheme(theme) {
      const palette = PALETTES[theme];
      const previous = stage.background;
      stage.background = backdropTexture(palette);
      // Swap the backdrop unless something else (an artist's chosen
      // inspector background) is showing.
      if (scene.background === previous) scene.background = stage.background;
      previous?.dispose();

      floorMaterial.map?.dispose();
      floorMaterial.map = floorTexture(palette);
      floorMaterial.needsUpdate = true;
      shadowOpacity = palette.shadowOpacity;
    },

    update(subjects) {
      const visible = subjects.filter(s => s.root.visible && !s.bounds.isEmpty());
      const present = new Set(subjects.map(s => s.root));
      for (const [root, mesh] of shadows) {
        if (!present.has(root)) {
          group.remove(mesh);
          mesh.material.dispose();
          shadows.delete(root);
        }
      }

      floor.visible = visible.length > 0;
      shadows.forEach(mesh => { mesh.visible = false; });
      if (!visible.length) return;

      allBox.makeEmpty();
      const boxes = visible.map(s => {
        s.root.updateWorldMatrix(true, false);
        const box = worldBox.copy(s.bounds).applyMatrix4(s.root.matrixWorld).clone();
        allBox.union(box);
        return box;
      });
      allBox.getSize(size);
      allBox.getCenter(center);
      const extent = Math.max(size.x, size.z, size.y, 1e-3);
      // Just under the lowest point, so the floor never cuts into a model.
      const floorY = allBox.min.y - extent * 0.002;

      floor.position.set(center.x, floorY, center.z);
      floor.scale.setScalar(extent * 2.2);

      visible.forEach((subject, i) => {
        const box = boxes[i];
        let mesh = shadows.get(subject.root);
        if (!mesh) {
          mesh = new THREE.Mesh(shadowGeometry, new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }));
          mesh.renderOrder = -1;
          mesh.raycast = noRaycast;
          group.add(mesh);
          shadows.set(subject.root, mesh);
        }
        const boxSize = box.getSize(size);
        const { size: shadowSize, strength } = shadowShape(Math.max(boxSize.x, boxSize.z), boxSize.y, box.min.y - floorY);
        mesh.visible = true;
        mesh.position.set((box.min.x + box.max.x) / 2, floorY + extent * 0.0005, (box.min.z + box.max.z) / 2);
        mesh.scale.set(shadowSize, 1, shadowSize);
        mesh.material.opacity = shadowOpacity * strength;
      });
    },

    dispose() {
      scene.remove(group);
      floor.geometry.dispose();
      floorMaterial.map?.dispose();
      floorMaterial.dispose();
      shadows.forEach(mesh => mesh.material.dispose());
      shadows.clear();
      shadowGeometry.dispose();
      shadowMap.dispose();
      stage.background?.dispose();
      environment.dispose();
    },
  };

  scene.environment = environment;
  // Toned down a little, so models are lit softly rather than flatly bright.
  scene.environmentIntensity = 0.75;
  renderer.toneMapping = stage.toneMapping;
  return stage;
}
