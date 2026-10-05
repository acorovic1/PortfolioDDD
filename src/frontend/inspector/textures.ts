import * as THREE from 'three';

// Procedurally generated inspector textures, so the viewer doesn't depend on
// shipping/hosting any image assets. Both are created lazily and cached for
// the lifetime of the page (they're tiny and shared by every focused model).

let matcapTexture: THREE.CanvasTexture | null = null;
let uvCheckerTexture: THREE.CanvasTexture | null = null;

// A soft clay-style matcap: lit from the top-left with a rim falloff.
export function getMatcapTexture(): THREE.CanvasTexture {
  if (matcapTexture) return matcapTexture;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1b1b1f';
  ctx.fillRect(0, 0, size, size);

  const base = ctx.createRadialGradient(size * 0.38, size * 0.32, size * 0.04, size / 2, size / 2, size / 2);
  base.addColorStop(0, '#f4efe9');
  base.addColorStop(0.35, '#c9bfb4');
  base.addColorStop(0.75, '#6e655d');
  base.addColorStop(1, '#2a2622');
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  matcapTexture = new THREE.CanvasTexture(canvas);
  matcapTexture.colorSpace = THREE.SRGBColorSpace;
  return matcapTexture;
}

// A colored, labelled checkerboard - stretching/seams/flipped islands are easy
// to spot because every cell is unique.
export function getUvCheckerTexture(): THREE.CanvasTexture {
  if (uvCheckerTexture) return uvCheckerTexture;

  const size = 1024;
  const cells = 8;
  const cell = size / cells;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const columnHues = [0, 30, 55, 120, 175, 210, 260, 310];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(cell * 0.28)}px sans-serif`;

  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const dark = (x + y) % 2 === 0;
      ctx.fillStyle = `hsl(${columnHues[x]}, 70%, ${dark ? 38 : 62}%)`;
      ctx.fillRect(x * cell, y * cell, cell, cell);

      ctx.fillStyle = dark ? '#ffffff' : '#111111';
      ctx.fillText(`${String.fromCharCode(65 + x)}${cells - y}`, x * cell + cell / 2, y * cell + cell / 2);
    }
  }

  uvCheckerTexture = new THREE.CanvasTexture(canvas);
  uvCheckerTexture.colorSpace = THREE.SRGBColorSpace;
  // glTF UVs have their origin top-left, so the canvas must not be flipped
  // for the labels to read upright on the model.
  uvCheckerTexture.flipY = false;
  uvCheckerTexture.wrapS = THREE.RepeatWrapping;
  uvCheckerTexture.wrapT = THREE.RepeatWrapping;
  uvCheckerTexture.anisotropy = 4;
  return uvCheckerTexture;
}
