import * as THREE from 'three';

// 2D artworks stand in the carousel as a stretched canvas on a wooden easel.
// Everything is built in metres (a real easel is about 2 m tall) and scaled
// to scene units, so the easel stands among models of a typical size.

// The colour the sides of the canvas are painted.
export type CanvasEdge = 'black' | 'white';
export const CANVAS_EDGES: CanvasEdge[] = ['black', 'white'];

export const ARTWORK_MEDIUMS = [
  'digital_painting', 'oil', 'acrylic', 'watercolour', 'gouache', 'ink', 'pencil', 'charcoal', 'mixed_media', 'print',
] as const;
export type ArtworkMedium = (typeof ARTWORK_MEDIUMS)[number];

// How a 2D artwork's canvas is presented (stored with the artwork). Its size
// isn't a setting: it follows the image's resolution (see canvasSize).
export type CanvasSettings = {
  edge: CanvasEdge;
  medium: ArtworkMedium | null;
};

export const DEFAULT_CANVAS: CanvasSettings = { edge: 'black', medium: null };

const SCALE = 1.8;
// Canvas size per image pixel: a 2400 px side is 1 m. The longer side stays
// within these limits (keeping the proportions), so a thumbnail-sized image
// is still visible and a huge scan doesn't dwarf the easel.
const PIXELS_PER_METRE = 2400;
const MIN_CANVAS_SIZE = 0.35;
const MAX_CANVAS_SIZE = 1.6;
// How far the canvas stands out from its stretcher bars.
const CANVAS_DEPTH = 0.045;
const LEDGE_HEIGHT = 0.7375;
// The easel leans back a little, as real ones do.
const TILT = -0.1;

const EASEL_KEY = 'easelCanvas';

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Shared by every easel; never disposed (they're tiny).
let woodTexture: THREE.Texture | null = null;
let weaveTexture: THREE.Texture | null = null;

// Pale beech, grain running along the length of each bar.
function wood(): THREE.Texture {
  if (woodTexture) return woodTexture;
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  woodTexture = canvasTexture(64, 512, ctx => {
    ctx.fillStyle = '#b8875a';
    ctx.fillRect(0, 0, 64, 512);
    for (let i = 0; i < 80; i++) {
      ctx.strokeStyle = `rgba(${70 + random() * 40 | 0},${42 + random() * 20 | 0},22,${0.08 + random() * 0.18})`;
      ctx.lineWidth = random() * 2 + 0.5;
      const x = random() * 64;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= 512; y += 32) ctx.lineTo(x + Math.sin(y * 0.012 + i) * 3, y);
      ctx.stroke();
    }
  });
  return woodTexture;
}

// Normal map of the canvas weave: a fine bumpy grid that catches side light.
function weave(): THREE.Texture {
  if (weaveTexture) return weaveTexture;
  const n = 128;
  const height = (i: number, j: number) =>
    Math.sin(i / 8 * Math.PI * 2) * Math.sin(j / 8 * Math.PI * 2) * 0.5 + Math.sin(i / 4 * Math.PI * 2) * 0.12;
  weaveTexture = canvasTexture(n, n, ctx => {
    const image = ctx.createImageData(n, n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const dx = (height(i + 1, j) - height(i - 1, j)) * 2.2;
        const dy = (height(i, j + 1) - height(i, j - 1)) * 2.2;
        const length = Math.hypot(dx, dy, 1);
        const k = (j * n + i) * 4;
        image.data[k] = (-dx / length * 0.5 + 0.5) * 255;
        image.data[k + 1] = (dy / length * 0.5 + 0.5) * 255;
        image.data[k + 2] = (1 / length * 0.5 + 0.5) * 255;
        image.data[k + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, false);
  weaveTexture.wrapS = weaveTexture.wrapT = THREE.RepeatWrapping;
  return weaveTexture;
}

// A video's canvas has this longer side (metres) whatever its resolution:
// footage is rarely large in pixels, and a 720p clip shouldn't come out
// smaller than a 4K one.
export const VIDEO_CANVAS_SIZE = 1.2;

// Width and height (metres) of the canvas for an image of this resolution,
// or with the longer side `fixedSize` long (keeping the proportions).
export function canvasSize(pixelWidth: number, pixelHeight: number, fixedSize?: number): { width: number; height: number } {
  const longest = Math.max(pixelWidth, pixelHeight, 1);
  const size = fixedSize ?? Math.min(Math.max(longest / PIXELS_PER_METRE, MIN_CANVAS_SIZE), MAX_CANVAS_SIZE);
  return { width: (pixelWidth / longest) * size, height: (pixelHeight / longest) * size };
}

// The easel with the artwork on it, centered on the origin like a loaded
// model, facing -z. `art` is the image (or video), `pixelWidth` x
// `pixelHeight` its resolution; `fixedSize` overrides the size it implies.
export function createEaselCanvas(
  art: THREE.Texture, pixelWidth: number, pixelHeight: number, settings: CanvasSettings, fixedSize?: number,
): THREE.Group {
  const { width, height } = canvasSize(pixelWidth, pixelHeight, fixedSize);
  const ownTextures: THREE.Texture[] = [];

  const woodMaterial = new THREE.MeshStandardMaterial({ map: wood(), roughness: 0.6 });
  const bar = (size: [number, number, number], position: [number, number, number], rotation: [number, number, number] = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), woodMaterial);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    return mesh;
  };

  const easel = new THREE.Group();
  const tilted = new THREE.Group();
  tilted.rotation.x = TILT;
  easel.add(tilted);

  const top = LEDGE_HEIGHT + height;
  const mastHeight = Math.max(2.15, top + 0.12);
  const ledgeWidth = Math.max(0.95, width + 0.08);
  tilted.add(
    bar([0.045, 1.95, 0.03], [-0.36, 0.975, 0], [0, 0, -0.1]),
    bar([0.045, 1.95, 0.03], [0.36, 0.975, 0], [0, 0, 0.1]),
    bar([0.045, mastHeight, 0.03], [0, mastHeight / 2, -0.02]),
    bar([ledgeWidth, 0.035, 0.11], [0, 0.72, 0.03]),
    bar([ledgeWidth, 0.04, 0.012], [0, 0.75, 0.08]),
    bar([0.12, 0.05, 0.07], [0, top + 0.025, 0.02]),
  );
  easel.add(bar([0.045, 1.85, 0.03], [0, 0.88, -0.42], [0.38, 0, 0]));

  // The canvas itself: the image on the front, the sides painted.
  const weaveMap = weave().clone();
  weaveMap.repeat.set(width * 9, height * 9);
  ownTextures.push(weaveMap);
  const front = new THREE.MeshStandardMaterial({ map: art, normalMap: weaveMap, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.85 });
  const painted = new THREE.MeshStandardMaterial({ color: settings.edge === 'white' ? 0xf1eee6 : 0x161616, roughness: 0.85 });
  const sides = [painted, painted, painted, painted];
  const back = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 1 });
  const canvas = new THREE.Mesh(new THREE.BoxGeometry(width, height, CANVAS_DEPTH), [...sides, front, back]);
  canvas.position.set(0, LEDGE_HEIGHT + height / 2, 0.03);
  tilted.add(canvas);

  easel.scale.setScalar(SCALE);
  // The carousel turns each piece's +z toward its center (lookAt), so the
  // canvas faces -z to face outward, toward the viewer.
  easel.rotation.y = Math.PI;

  // Centered on the origin, as loadModel() centers models.
  const group = new THREE.Group();
  group.add(easel);
  const center = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
  easel.position.sub(center);

  group.userData[EASEL_KEY] = { art, pixelWidth, pixelHeight, fixedSize };
  // Called by disposeObject(): the image belongs to this easel alone (the
  // wood and weave textures are shared).
  group.userData.onDispose = () => {
    ownTextures.forEach(texture => texture.dispose());
    if (!group.userData.keepArt) art.dispose();
  };
  return group;
}

// The easel under `root` (a piece's root), if it's a 2D artwork.
export function findEaselCanvas(root: THREE.Object3D): THREE.Group | null {
  let found: THREE.Group | null = null;
  root.traverse(object => {
    if (!found && object.userData[EASEL_KEY]) found = object as THREE.Group;
  });
  return found;
}

// The same artwork on a new canvas (e.g. with other edges), in place of
// `easel`. The old easel is detached; dispose it with disposeObject().
export function rebuildEaselCanvas(easel: THREE.Group, settings: CanvasSettings): THREE.Group {
  const { art, pixelWidth, pixelHeight, fixedSize } = easel.userData[EASEL_KEY] as {
    art: THREE.Texture; pixelWidth: number; pixelHeight: number; fixedSize?: number;
  };
  const rebuilt = createEaselCanvas(art, pixelWidth, pixelHeight, settings, fixedSize);
  easel.userData.keepArt = true;
  const parent = easel.parent;
  if (parent) {
    parent.add(rebuilt);
    parent.remove(easel);
  }
  return rebuilt;
}
