import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { canvasSize, createEaselCanvas, findEaselCanvas, rebuildEaselCanvas, DEFAULT_CANVAS } from './easelCanvas';
import { disposeObject } from './sceneUtils';

// jsdom has no 2D canvas; the textures' drawing is a no-op here.
beforeAll(() => {
  const noop = () => {};
  const context = new Proxy({}, {
    get: (_target, key) => {
      if (key === 'createImageData') return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: noop });
      return noop;
    },
    set: () => true,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context as never);
});

function artTexture(width = 300, height = 400): THREE.Texture {
  const texture = new THREE.Texture();
  texture.image = { width, height };
  return texture;
}

// The canvas (the box with the image on its front face) inside an easel.
function canvasMesh(easel: THREE.Object3D): THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial[]> {
  let found: THREE.Mesh | undefined;
  easel.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && Array.isArray(mesh.material) && mesh.material.length === 6) found = mesh;
  });
  return found as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial[]>;
}

describe('canvasSize', () => {
  it('grows with the resolution, keeping the proportions', () => {
    expect(canvasSize(1800, 2400)).toEqual({ width: 0.75, height: 1 });
    expect(canvasSize(2400, 1200)).toEqual({ width: 1, height: 0.5 });
    const small = canvasSize(1200, 1200);
    const large = canvasSize(3600, 3600);
    expect(large.width / small.width).toBeCloseTo(3);
  });

  it('stays between a visible minimum and a size the easel can hold', () => {
    expect(canvasSize(64, 48)).toEqual({ width: 0.35, height: expect.closeTo(0.2625) });
    expect(canvasSize(20000, 10000)).toEqual({ width: 1.6, height: 0.8 });
  });

  it('can have a fixed size instead (videos), still keeping the proportions', () => {
    expect(canvasSize(640, 360, 1.2)).toEqual({ width: 1.2, height: expect.closeTo(0.675) });
    expect(canvasSize(1080, 1920, 1.2)).toEqual({ width: expect.closeTo(0.675), height: 1.2 });
  });
});

describe('createEaselCanvas', () => {
  it('is centered on the origin, like a loaded model', () => {
    const easel = createEaselCanvas(artTexture(), 300, 400, DEFAULT_CANVAS);
    const center = new THREE.Box3().setFromObject(easel).getCenter(new THREE.Vector3());
    expect(center.length()).toBeLessThan(1e-6);
  });

  it('puts the image on the front of a canvas of its proportions', () => {
    const art = artTexture(400, 200);
    const mesh = canvasMesh(createEaselCanvas(art, 400, 200, DEFAULT_CANVAS));
    const { width, height } = mesh.geometry.parameters;
    expect(width / height).toBeCloseTo(2);
    // Box faces: +x, -x, +y, -y, +z (front), -z (back).
    expect(mesh.material[4].map).toBe(art);
  });

  it('paints the sides black or white', () => {
    const black = canvasMesh(createEaselCanvas(artTexture(), 300, 400, { ...DEFAULT_CANVAS, edge: 'black' }));
    black.material.slice(0, 4).forEach(side => {
      expect(side.map).toBeNull();
      expect(side.color.getHex()).toBe(0x161616);
    });
    const white = canvasMesh(createEaselCanvas(artTexture(), 300, 400, { ...DEFAULT_CANVAS, edge: 'white' }));
    white.material.slice(0, 4).forEach(side => expect(side.color.getHex()).toBe(0xf1eee6));
  });
});

describe('rebuildEaselCanvas', () => {
  it('swaps in a new canvas with the same image, which is freed only once', () => {
    const art = artTexture();
    const dispose = vi.spyOn(art, 'dispose');
    const root = new THREE.Group();
    const easel = createEaselCanvas(art, 300, 400, DEFAULT_CANVAS);
    root.add(easel);
    expect(findEaselCanvas(root)).toBe(easel);

    const rebuilt = rebuildEaselCanvas(easel, { ...DEFAULT_CANVAS, edge: 'white' });
    disposeObject(easel);
    expect(findEaselCanvas(root)).toBe(rebuilt);
    expect(easel.parent).toBeNull();
    expect(canvasMesh(rebuilt).material[4].map).toBe(art);
    expect(dispose).not.toHaveBeenCalled();

    disposeObject(root);
    expect(dispose).toHaveBeenCalledOnce();
  });
});
