import * as THREE from 'three';

export type TextureChannel = 'albedo' | 'normal' | 'roughness' | 'metalness' | 'ao' | 'emissive';

export type ModelStats = {
  triangles: number;
  vertices: number;
  meshes: number;
  materials: number;
  textures: number;
  maxTextureSize: number;
  animations: number;
  bones: number;
  morphTargets: number;
  dimensions: { x: number; y: number; z: number };
  // Which texture channels at least one material actually has a map for.
  channels: Record<TextureChannel, boolean>;
};

const CHANNEL_MAP_KEYS: Record<TextureChannel, string> = {
  albedo: 'map',
  normal: 'normalMap',
  roughness: 'roughnessMap',
  metalness: 'metalnessMap',
  ao: 'aoMap',
  emissive: 'emissiveMap',
};

const TEXTURE_KEYS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
  'alphaMap', 'bumpMap', 'displacementMap', 'clearcoatMap', 'clearcoatNormalMap',
  'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap', 'specularColorMap',
  'specularIntensityMap', 'transmissionMap', 'thicknessMap', 'iridescenceMap',
  'iridescenceThicknessMap', 'anisotropyMap', 'lightMap',
];

function triangleCount(mesh: THREE.Mesh): number {
  const geometry = mesh.geometry;
  const count = geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0;
  const drawCount = Math.min(count, geometry.drawRange.count);
  return Math.floor(drawCount / 3);
}

function textureSize(texture: THREE.Texture): number {
  const image = texture.image as { width?: number; height?: number } | undefined;
  return Math.max(image?.width ?? 0, image?.height ?? 0);
}

// `localBounds` is the model's bounds in its own space - the carousel rotates
// every piece to face the center, so a world-space box would be skewed.
export function computeModelStats(
  root: THREE.Object3D,
  animations: THREE.AnimationClip[],
  localBounds: THREE.Box3
): ModelStats {
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const bones = new Set<THREE.Bone>();
  const channels: Record<TextureChannel, boolean> = {
    albedo: false, normal: false, roughness: false, metalness: false, ao: false, emissive: false,
  };

  let triangles = 0;
  let vertices = 0;
  let meshes = 0;
  let morphTargets = 0;

  root.traverse((obj) => {
    if (obj.userData.inspectorOverlay) return;

    const bone = obj as THREE.Bone;
    if (bone.isBone) bones.add(bone);

    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    meshes++;
    triangles += triangleCount(mesh);
    vertices += mesh.geometry.attributes.position?.count ?? 0;
    morphTargets += mesh.morphTargetInfluences?.length ?? 0;

    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    meshMaterials.forEach((material) => {
      materials.add(material);
      const slots = material as unknown as Record<string, unknown>;
      TEXTURE_KEYS.forEach((key) => {
        const texture = slots[key] as THREE.Texture | null | undefined;
        if (texture?.isTexture) textures.add(texture);
      });
      (Object.keys(CHANNEL_MAP_KEYS) as TextureChannel[]).forEach((channel) => {
        if ((slots[CHANNEL_MAP_KEYS[channel]] as THREE.Texture | null | undefined)?.isTexture) {
          channels[channel] = true;
        }
      });
    });
  });

  const size = localBounds.getSize(new THREE.Vector3());
  let maxTextureSize = 0;
  textures.forEach((texture) => {
    maxTextureSize = Math.max(maxTextureSize, textureSize(texture));
  });

  return {
    triangles,
    vertices,
    meshes,
    materials: materials.size,
    textures: textures.size,
    maxTextureSize,
    animations: animations.length,
    bones: bones.size,
    morphTargets,
    dimensions: { x: size.x, y: size.y, z: size.z },
    channels,
  };
}
