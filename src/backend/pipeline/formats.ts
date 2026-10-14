import path from 'node:path';

// Every format the upload pipeline accepts. Everything is converted to an
// optimized GLB server-side, so the frontend only ever loads GLB.
// Only formats parsed in-process by JS code are accepted: FBX, .blend and USD
// would need native converters (FBX2glTF, Blender) to run on untrusted files.
export const MODEL_FORMATS = ['glb', 'gltf', 'obj', 'stl'] as const;
export type ModelFormat = (typeof MODEL_FORMATS)[number];

// A .zip bundles a model with its textures/.bin/.mtl side files.
export const UPLOAD_EXTENSIONS = new Set([...MODEL_FORMATS.map(f => `.${f}`), '.zip']);

// When a .zip holds several model files, the most "native" one wins
// (a .gltf next to an exported .obj is the better source, etc.).
const ZIP_PRIORITY: ModelFormat[] = ['glb', 'gltf', 'obj', 'stl'];

export function formatOf(fileName: string): ModelFormat | null {
  const ext = path.extname(fileName).toLowerCase().slice(1);
  return (MODEL_FORMATS as readonly string[]).includes(ext) ? (ext as ModelFormat) : null;
}

export function pickPrimaryModel(files: string[]): string | null {
  for (const format of ZIP_PRIORITY) {
    const matches = files
      .filter(f => formatOf(f) === format)
      // Prefer the shallowest file (the main model, not some nested asset).
      .sort((a, b) => a.split(/[\\/]/).length - b.split(/[\\/]/).length || a.localeCompare(b));
    if (matches.length > 0) return matches[0];
  }
  return null;
}
