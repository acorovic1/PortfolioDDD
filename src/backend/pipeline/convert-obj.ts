import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { Document, type Material, type Texture } from '@gltf-transform/core';
import { listFiles, isInside } from './archive.ts';

type MtlMaterial = {
  name: string;
  diffuse?: [number, number, number];
  emissive?: [number, number, number];
  shininess?: number;
  opacity?: number;
  roughness?: number;
  metalness?: number;
  diffuseMap?: string;
  normalMap?: string;
  emissiveMap?: string;
};

// Texture-map options and how many arguments each one takes ("-s 1 1 1").
const MAP_OPTION_ARGS: Record<string, number> = {
  '-bm': 1, '-blendu': 1, '-blendv': 1, '-boost': 1, '-cc': 1, '-clamp': 1,
  '-imfchan': 1, '-mm': 2, '-o': 3, '-s': 3, '-t': 3, '-texres': 1, '-type': 1,
};

function mapFileName(args: string[]): string {
  let i = 0;
  while (i < args.length && args[i].startsWith('-') && MAP_OPTION_ARGS[args[i]] !== undefined) {
    const option = args[i];
    i++;
    // -o/-s/-t take "up to" 3 numbers.
    for (let n = 0; n < MAP_OPTION_ARGS[option] && i < args.length && /^-?[\d.]+$/.test(args[i]); n++) i++;
  }
  return args.slice(i).join(' ');
}

function parseColor(args: string[]): [number, number, number] {
  const [r = 0, g = r, b = r] = args.map(Number);
  return [r, g, b];
}

export function parseMtl(text: string): Map<string, MtlMaterial> {
  const materials = new Map<string, MtlMaterial>();
  let current: MtlMaterial | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const [keyword, ...args] = line.split(/\s+/);
    const key = keyword.toLowerCase();

    if (key === 'newmtl') {
      current = { name: args.join(' ') };
      materials.set(current.name, current);
      continue;
    }
    if (!current) continue;

    switch (key) {
      case 'kd': current.diffuse = parseColor(args); break;
      case 'ke': current.emissive = parseColor(args); break;
      case 'ns': current.shininess = Number(args[0]); break;
      case 'd': current.opacity = Number(args[0]); break;
      case 'tr': current.opacity = 1 - Number(args[0]); break;
      case 'pr': current.roughness = Number(args[0]); break;
      case 'pm': current.metalness = Number(args[0]); break;
      case 'map_kd': current.diffuseMap = mapFileName(args); break;
      case 'map_ke': current.emissiveMap = mapFileName(args); break;
      // Exporters (Blender included) commonly write normal maps as bump maps.
      case 'norm':
      case 'map_bump':
      case 'bump': current.normalMap = mapFileName(args); break;
    }
  }

  return materials;
}

const DIRECT_IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

// Resolves texture references, which are often absolute paths from the
// artist's machine or differ in case: tries the relative path first, then
// falls back to a file with the same name anywhere in the upload. Never
// outside the upload (`rootDir`): a crafted .mtl could otherwise pull in
// files from the server.
class TextureResolver {
  private readonly baseDir: string;
  private readonly rootDir: string;
  private readonly byName = new Map<string, string>();
  private readonly cache = new Map<string, Texture | null>();
  private readonly document: Document;

  constructor(document: Document, baseDir: string, rootDir: string, files: string[]) {
    this.document = document;
    this.baseDir = baseDir;
    this.rootDir = rootDir;
    for (const file of files) {
      const key = path.basename(file).toLowerCase();
      if (!this.byName.has(key)) this.byName.set(key, path.join(rootDir, file));
    }
  }

  async get(reference: string | undefined): Promise<Texture | null> {
    if (!reference) return null;
    if (this.cache.has(reference)) return this.cache.get(reference)!;

    const texture = await this.load(reference);
    this.cache.set(reference, texture);
    return texture;
  }

  private async load(reference: string): Promise<Texture | null> {
    const normalized = reference.replace(/\\/g, '/');
    const direct = path.resolve(this.baseDir, normalized);
    const filePath = isInside(this.rootDir, direct) && existsSync(direct)
      ? direct
      : this.byName.get(path.posix.basename(normalized).toLowerCase());
    if (!filePath) {
      console.warn(`OBJ texture not found in upload: ${reference}`);
      return null;
    }

    const ext = path.extname(filePath).toLowerCase();
    let image: Uint8Array;
    let mimeType = DIRECT_IMAGE_TYPES[ext];
    try {
      if (mimeType) {
        image = await readFile(filePath);
      } else {
        // .tif/.gif/.bmp etc. aren't valid in glTF - re-encode as PNG.
        image = await sharp(filePath).png().toBuffer();
        mimeType = 'image/png';
      }
    } catch {
      console.warn(`OBJ texture could not be read: ${reference}`);
      return null;
    }

    return this.document.createTexture(path.basename(filePath))
      .setImage(image)
      .setMimeType(mimeType)
      .setURI(path.basename(filePath, ext) + (mimeType === 'image/jpeg' ? '.jpg' : `.${mimeType.split('/')[1]}`));
  }
}

async function createMaterial(
  document: Document,
  name: string,
  mtl: MtlMaterial | undefined,
  textures: TextureResolver
): Promise<Material> {
  const material = document.createMaterial(name || 'default');
  const [r, g, b] = mtl?.diffuse ?? [0.8, 0.8, 0.8];
  const opacity = mtl?.opacity ?? 1;

  material
    .setBaseColorFactor([r, g, b, opacity])
    .setMetallicFactor(mtl?.metalness ?? 0)
    // Phong shininess -> roughness (the usual Blinn-Phong approximation).
    .setRoughnessFactor(mtl?.roughness ?? Math.min(1, Math.sqrt(2 / ((mtl?.shininess ?? 10) + 2))));

  if (opacity < 1) material.setAlphaMode('BLEND');

  const diffuseMap = await textures.get(mtl?.diffuseMap);
  if (diffuseMap) {
    material.setBaseColorTexture(diffuseMap);
    // MTL multiplies Kd with map_Kd, but exporters routinely leave Kd at a
    // dark default next to a texture - glTF convention is a white factor.
    material.setBaseColorFactor([1, 1, 1, opacity]);
  }

  const normalMap = await textures.get(mtl?.normalMap);
  if (normalMap) material.setNormalTexture(normalMap);

  const emissiveMap = await textures.get(mtl?.emissiveMap);
  if (emissiveMap) {
    material.setEmissiveTexture(emissiveMap).setEmissiveFactor([1, 1, 1]);
  } else if (mtl?.emissive) {
    material.setEmissiveFactor(mtl.emissive);
  }

  return material;
}

function sliceAttribute(attribute: THREE.BufferAttribute, start: number, count: number): Float32Array<ArrayBuffer> {
  const size = attribute.itemSize;
  return new Float32Array((attribute.array as Float32Array).slice(start * size, (start + count) * size));
}

// Converts an OBJ (+ its .mtl and textures, looked up in `rootDir`) into a
// glTF document. Geometry parsing reuses three's OBJLoader, which is pure JS.
export async function objToDocument(objPath: string, rootDir: string): Promise<Document> {
  const text = await readFile(objPath, 'utf-8');
  const baseDir = path.dirname(objPath);
  const files = await listFiles(rootDir);

  const mtlMaterials = new Map<string, MtlMaterial>();
  const referencedMtls = [...text.matchAll(/^\s*mtllib\s+(.+?)\s*$/gm)].map(m => m[1]);
  const mtlPaths = referencedMtls.length > 0
    ? referencedMtls.map(ref => path.resolve(baseDir, ref.replace(/\\/g, '/')))
    : files.filter(f => f.toLowerCase().endsWith('.mtl')).map(f => path.join(rootDir, f));

  for (const mtlPath of mtlPaths) {
    const resolved = isInside(rootDir, mtlPath) && existsSync(mtlPath)
      ? mtlPath
      : files.map(f => path.join(rootDir, f)).find(f => path.basename(f).toLowerCase() === path.basename(mtlPath).toLowerCase());
    if (!resolved) continue;
    parseMtl(await readFile(resolved, 'utf-8')).forEach((material, name) => mtlMaterials.set(name, material));
  }

  const group = new OBJLoader().parse(text);
  const document = new Document();
  const buffer = document.createBuffer();
  const textures = new TextureResolver(document, baseDir, rootDir, files);
  const materials = new Map<string, Material>();
  const scene = document.createScene(path.basename(objPath, path.extname(objPath)));

  const materialFor = async (name: string) => {
    let material = materials.get(name);
    if (!material) {
      material = await createMaterial(document, name, mtlMaterials.get(name), textures);
      materials.set(name, material);
    }
    return material;
  };

  let primitiveCount = 0;
  for (const child of group.children) {
    const object = child as THREE.Mesh;
    // Points/lines in an OBJ aren't meaningful for a portfolio model.
    if (!object.isMesh) continue;

    const geometry = object.geometry as THREE.BufferGeometry;
    if (!geometry.attributes.normal) geometry.computeVertexNormals();

    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const vertexCount = geometry.attributes.position.count;
    const groups = geometry.groups.length > 0
      ? geometry.groups
      : [{ start: 0, count: vertexCount, materialIndex: 0 }];

    const mesh = document.createMesh(object.name || 'mesh');
    for (const { start, count, materialIndex = 0 } of groups) {
      if (count === 0) continue;
      const primitive = document.createPrimitive();

      const attributes: [string, string][] = [['position', 'POSITION'], ['normal', 'NORMAL'], ['uv', 'TEXCOORD_0'], ['color', 'COLOR_0']];
      for (const [threeName, gltfName] of attributes) {
        const attribute = geometry.attributes[threeName] as THREE.BufferAttribute | undefined;
        if (!attribute) continue;
        primitive.setAttribute(
          gltfName,
          document.createAccessor()
            .setType(attribute.itemSize === 2 ? 'VEC2' : 'VEC3')
            .setArray(sliceAttribute(attribute, start, count))
            .setBuffer(buffer)
        );
      }

      primitive.setMaterial(await materialFor(objectMaterials[materialIndex]?.name ?? 'default'));
      mesh.addPrimitive(primitive);
      primitiveCount++;
    }

    scene.addChild(document.createNode(object.name || 'mesh').setMesh(mesh));
  }

  if (primitiveCount === 0) throw new Error('The OBJ file contains no faces');
  return document;
}
