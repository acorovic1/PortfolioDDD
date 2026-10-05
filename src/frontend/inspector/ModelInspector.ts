import * as THREE from 'three';
import { getMatcapTexture, getUvCheckerTexture } from './textures';
import { computeModelStats, type ModelStats, type TextureChannel } from './modelStats';

export type ShadingMode = 'lit' | 'wireframe' | 'matcap' | 'uv-checker' | 'normals';
export type ViewMode = ShadingMode | `channel:${TextureChannel}`;

export type AnimationClipInfo = { name: string; duration: number };

type SavedTransform = { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 };

type AnyMaterial = THREE.Material & Record<string, unknown>;

// Which texture component holds the data for each channel. glTF packs
// roughness (G) and metalness (B) into one texture, and occlusion lives in R.
const CHANNEL_SWIZZLE: Partial<Record<TextureChannel, 'r' | 'g' | 'b'>> = {
  roughness: 'g',
  metalness: 'b',
  ao: 'r',
};

// Data textures (not colors) are shown as their raw values, so undo the
// sRGB output encoding that would otherwise brighten them.
const LINEAR_DATA_CHANNELS = new Set<TextureChannel>(['normal', 'roughness', 'metalness', 'ao']);

function texture(material: AnyMaterial, key: string): THREE.Texture | null {
  const value = material[key] as THREE.Texture | null | undefined;
  return value?.isTexture ? value : null;
}

function number(material: AnyMaterial, key: string, fallback: number): number {
  const value = material[key];
  return typeof value === 'number' ? value : fallback;
}

function color(material: AnyMaterial, key: string, fallback: THREE.ColorRepresentation): THREE.Color {
  const value = material[key] as THREE.Color | undefined;
  return value?.isColor ? value.clone() : new THREE.Color(fallback);
}

// A MeshBasicMaterial showing `map`, optionally reduced to one component and/or
// left un-encoded. Built on a stock material so skinning/morphs keep working.
function channelMaterial(
  map: THREE.Texture | null,
  tint: THREE.Color,
  swizzle: 'r' | 'g' | 'b' | null,
  linearData: boolean
): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ map, color: tint, toneMapped: false });

  if (swizzle || linearData) {
    material.onBeforeCompile = (shader) => {
      const sample = swizzle ? `vec3( sampledDiffuseColor.${swizzle} )` : 'sampledDiffuseColor.rgb';
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
            vec4 sampledDiffuseColor = texture2D( map, vMapUv );
            diffuseColor.rgb *= ${sample};
          #endif`
        )
        .replace(
          '#include <colorspace_fragment>',
          linearData
            ? 'gl_FragColor.rgb = pow( gl_FragColor.rgb, vec3( 2.2 ) );\n#include <colorspace_fragment>'
            : '#include <colorspace_fragment>'
        );
    };
    material.customProgramCacheKey = () => `inspector-channel-${swizzle ?? 'rgb'}-${linearData}`;
  }

  return material;
}

function createModeMaterial(mode: ViewMode, original: AnyMaterial): THREE.Material {
  const side = original.side;
  // Faceted models (e.g. glTF without normals) keep their faceted look.
  const flatShading = original.flatShading === true;

  switch (mode) {
    case 'wireframe':
      return new THREE.MeshBasicMaterial({ color: 0xc8d2e0, wireframe: true, side, toneMapped: false });

    case 'matcap':
      return new THREE.MeshMatcapMaterial({
        matcap: getMatcapTexture(),
        normalMap: texture(original, 'normalMap'),
        side,
        flatShading,
      });

    case 'uv-checker':
      return new THREE.MeshBasicMaterial({ map: getUvCheckerTexture(), side, toneMapped: false });

    case 'normals':
      return new THREE.MeshNormalMaterial({ side, flatShading });

    case 'channel:albedo': {
      const material = channelMaterial(texture(original, 'map'), color(original, 'color', 0xffffff), null, false);
      material.side = side;
      material.transparent = original.transparent;
      material.opacity = original.opacity;
      material.alphaTest = original.alphaTest;
      return material;
    }

    case 'channel:normal': {
      const map = texture(original, 'normalMap');
      // No normal map means a flat surface: the tangent-space "up" color.
      const material = channelMaterial(map, map ? new THREE.Color(1, 1, 1) : new THREE.Color(0.5, 0.5, 1), null, true);
      material.side = side;
      return material;
    }

    case 'channel:roughness':
    case 'channel:metalness':
    case 'channel:ao': {
      const channel = mode.slice('channel:'.length) as TextureChannel;
      const mapKey = channel === 'ao' ? 'aoMap' : `${channel}Map`;
      const factor = channel === 'ao' ? 1 : number(original, channel, channel === 'roughness' ? 1 : 0);
      const material = channelMaterial(
        texture(original, mapKey),
        new THREE.Color(factor, factor, factor),
        CHANNEL_SWIZZLE[channel] ?? null,
        LINEAR_DATA_CHANNELS.has(channel)
      );
      material.side = side;
      return material;
    }

    case 'channel:emissive': {
      const tint = color(original, 'emissive', 0x000000).multiplyScalar(number(original, 'emissiveIntensity', 1));
      const material = channelMaterial(texture(original, 'emissiveMap'), tint, null, false);
      material.side = side;
      return material;
    }

    default:
      return original;
  }
}

// Owns everything the inspector changes on a focused model - material swaps,
// wireframe overlays, animation playback - and puts the model back exactly as
// it was on dispose(), since the same object keeps living in the carousel.
export class ModelInspector {
  readonly stats: ModelStats;
  readonly clips: AnimationClipInfo[];

  private readonly root: THREE.Object3D;
  private readonly animations: THREE.AnimationClip[];
  private readonly meshes: THREE.Mesh[] = [];
  private readonly originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private readonly savedTransforms = new Map<THREE.Object3D, SavedTransform>();
  private readonly savedMorphInfluences = new Map<THREE.Mesh, number[]>();
  private modeMaterials: THREE.Material[] = [];
  private overlays: THREE.Mesh[] = [];
  private overlayMaterial: THREE.MeshBasicMaterial | null = null;

  private mixer: THREE.AnimationMixer | null = null;
  private action: THREE.AnimationAction | null = null;
  private activeClipIndex = -1;

  constructor(root: THREE.Object3D, animations: THREE.AnimationClip[], localBounds: THREE.Box3) {
    this.root = root;
    this.animations = animations;
    this.stats = computeModelStats(root, animations, localBounds);
    this.clips = animations.map((clip, i) => ({ name: clip.name || `Clip ${i + 1}`, duration: clip.duration }));

    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        this.meshes.push(mesh);
        this.originalMaterials.set(mesh, mesh.material);
        if (mesh.morphTargetInfluences) this.savedMorphInfluences.set(mesh, [...mesh.morphTargetInfluences]);
      }
      if (obj !== root) {
        this.savedTransforms.set(obj, {
          position: obj.position.clone(),
          quaternion: obj.quaternion.clone(),
          scale: obj.scale.clone(),
        });
      }
    });
  }

  setViewMode(mode: ViewMode): void {
    this.disposeModeMaterials();

    if (mode === 'lit') {
      this.originalMaterials.forEach((material, mesh) => {
        mesh.material = material;
      });
      return;
    }

    // One replacement per distinct original material, shared across meshes.
    const replacements = new Map<THREE.Material, THREE.Material>();
    const replace = (original: THREE.Material) => {
      let replacement = replacements.get(original);
      if (!replacement) {
        replacement = createModeMaterial(mode, original as AnyMaterial);
        replacements.set(original, replacement);
        if (replacement !== original) this.modeMaterials.push(replacement);
      }
      return replacement;
    };

    this.originalMaterials.forEach((material, mesh) => {
      mesh.material = Array.isArray(material) ? material.map(replace) : replace(material);
    });
  }

  // A translucent wireframe drawn on top of whatever shading mode is active.
  setWireframeOverlay(enabled: boolean): void {
    this.removeOverlays();
    if (!enabled) return;

    this.overlayMaterial = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      toneMapped: false,
    });

    this.meshes.forEach((mesh) => {
      const skinned = mesh as THREE.SkinnedMesh;
      let overlay: THREE.Mesh;

      if (skinned.isSkinnedMesh) {
        const skinnedOverlay = new THREE.SkinnedMesh(mesh.geometry, this.overlayMaterial!);
        skinnedOverlay.bindMode = skinned.bindMode;
        skinnedOverlay.bind(skinned.skeleton, skinned.bindMatrix);
        overlay = skinnedOverlay;
      } else {
        overlay = new THREE.Mesh(mesh.geometry, this.overlayMaterial!);
      }

      // Share the morph state so the overlay deforms along with its source.
      overlay.morphTargetInfluences = mesh.morphTargetInfluences;
      overlay.morphTargetDictionary = mesh.morphTargetDictionary;
      overlay.userData.inspectorOverlay = true;
      overlay.raycast = () => {};
      overlay.renderOrder = 1;
      mesh.add(overlay);
      this.overlays.push(overlay);
    });
  }

  // --- Animation playback ---

  playClip(index: number): void {
    const clip = this.animations[index];
    if (!clip) return;

    if (!this.mixer) this.mixer = new THREE.AnimationMixer(this.root);
    this.action?.stop();

    this.action = this.mixer.clipAction(clip);
    this.action.reset();
    this.action.paused = false;
    this.action.play();
    this.activeClipIndex = index;
  }

  get activeClip(): number {
    return this.activeClipIndex;
  }

  setPaused(paused: boolean): void {
    if (this.action) this.action.paused = paused;
  }

  get isPaused(): boolean {
    return !this.action || this.action.paused;
  }

  setSpeed(speed: number): void {
    if (this.mixer) this.mixer.timeScale = speed;
  }

  seek(time: number): void {
    if (!this.action || !this.mixer) return;
    this.action.time = time;
    this.mixer.update(0);
  }

  get currentTime(): number {
    return this.action?.time ?? 0;
  }

  update(delta: number): void {
    this.mixer?.update(delta);
  }

  // Stops playback and returns the model to the pose it was focused in.
  stopAnimation(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.root);
      this.mixer = null;
      this.action = null;
    }
    this.activeClipIndex = -1;

    this.savedTransforms.forEach((saved, obj) => {
      obj.position.copy(saved.position);
      obj.quaternion.copy(saved.quaternion);
      obj.scale.copy(saved.scale);
    });
    this.savedMorphInfluences.forEach((influences, mesh) => {
      influences.forEach((value, i) => {
        mesh.morphTargetInfluences![i] = value;
      });
    });
  }

  // --- Teardown ---

  dispose(): void {
    this.removeOverlays();
    this.setViewMode('lit');
    this.stopAnimation();
  }

  private disposeModeMaterials(): void {
    this.modeMaterials.forEach((material) => material.dispose());
    this.modeMaterials = [];
  }

  private removeOverlays(): void {
    this.overlays.forEach((overlay) => overlay.removeFromParent());
    this.overlays = [];
    this.overlayMaterial?.dispose();
    this.overlayMaterial = null;
  }
}
