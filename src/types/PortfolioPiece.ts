import * as THREE from 'three';
import type { ArtworkInfoData } from './ArtworkInfoData'
import { getGLTFLoader } from '@/frontend/three/gltfLoader';
import { assetUrl } from '@/frontend/utils/api';
import type { ViewerSettings } from '@/frontend/inspector/PostProcessing';

// crypto.randomUUID only exists on secure (HTTPS/localhost) pages; a site
// opened over plain HTTP (a LAN address, a custom domain before its
// certificate) still needs ids.
export function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}



export type PortfolioImage = {
  id: string;
  url: string;
  caption: string;
};

export type PortfolioPiece = {
  id: string;
  root: THREE.Group;   // logical object
  bounds: THREE.Box3;  // local-space bounds
  renders: PortfolioImage[];
  infoData: ArtworkInfoData;
  likeCount: number;
  // Animation clips shipped with the model (played back in the inspector).
  animations: THREE.AnimationClip[];
  // The processed model file this piece was loaded from (backend artworks).
  modelInfo?: ModelFileInfo;
  publishing?: PublishingState;
  // The artist's saved inspector view (null/absent = defaults).
  viewerSettings?: ViewerSettings | null;
};

export type Visibility = 'public' | 'unlisted' | 'private';

export type PublishingState = {
  visibility: Visibility;
  // null = draft; in the future = scheduled
  publishedAt: string | null;
  isMature: boolean;
  aiGenerated: boolean;
  viewCount: number;
};

export type PublishStatus = 'draft' | 'scheduled' | 'published';

export function publishStatus(publishedAt: string | null): PublishStatus {
  if (!publishedAt) return 'draft';
  return new Date(publishedAt).getTime() > Date.now() ? 'scheduled' : 'published';
}

export type ModelFileInfo = {
  sourceFormat: string | null;
  version: number;
  sizeBytes: number | null;
  thumbnailUrl: string | null;
};

export type LoadedModel = {
  scene: THREE.Group;
  bounds: THREE.Box3;  // local-space bounds, after centering
  animations: THREE.AnimationClip[];
};

// Loads a GLB/glTF and centers it on the origin, without adding it anywhere.
export async function loadModel(path: string): Promise<LoadedModel> {
  const gltf = await getGLTFLoader().loadAsync(path);

  // glTF allows omitting normals (clients then shade flat - GLTFLoader turns
  // on flatShading for those). Normal-based rendering such as the inspector's
  // matcap/normals views and ambient occlusion still needs the attribute.
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && !mesh.geometry.attributes.normal) {
      mesh.geometry.computeVertexNormals();
    }
  });

  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  const center = bounds.getCenter(new THREE.Vector3());
  gltf.scene.position.sub(center);
  bounds.setFromObject(gltf.scene);

  return { scene: gltf.scene, bounds, animations: gltf.animations };
}

export async function createPortfolioItem(
  scene: THREE.Scene,
  path: string
): Promise<PortfolioPiece> {
  const model = await loadModel(path);

  const root = new THREE.Group();
  root.add(model.scene);

  const emptyArtworkInfo: ArtworkInfoData = {
    title: '',
    description: '',
    tools: [],
    year: '',
    category: '',
    tags: [],
  };

  const emptyRenderImages: PortfolioImage[] = [];


  scene.add(root);

  return {
    id: randomId(),
    root: root,
    bounds: model.bounds,
    infoData: emptyArtworkInfo,
    renders: emptyRenderImages,
    likeCount: 0,
    animations: model.animations,
  };
}

export type ModelProcessingStatus = 'processing' | 'ready' | 'failed';

export type RemoteArtwork = {
  id: string;
  title: string;
  description: string;
  year: string;
  category: string;
  tools: string[];
  // '' until the uploaded model has finished server-side processing.
  modelUrl: string;
  processingStatus: ModelProcessingStatus;
  processingError: string | null;
  sourceFormat: string | null;
  modelVersion: number;
  modelSizeBytes: number | null;
  thumbnailUrl: string | null;
  tags: string[];
  visibility: Visibility;
  publishedAt: string | null;
  isMature: boolean;
  aiGenerated: boolean;
  viewCount: number;
  viewerSettings: ViewerSettings | null;
  renders: { id: string; url: string; caption: string }[];
  likeCount: number;
  // Populated by endpoints that can return artworks belonging to anyone
  // (e.g. resolving a liked-posts or saved-collection list).
  username?: string;
};

// Reconstructs a PortfolioPiece from a backend artwork record (used to load a
// user's previously-saved portfolio into the 3D scene, e.g. after login).
export async function createPortfolioItemFromRemote(
  scene: THREE.Scene,
  remote: RemoteArtwork
): Promise<PortfolioPiece> {
  const piece = await createPortfolioItem(scene, assetUrl(remote.modelUrl)!);

  piece.id = remote.id;
  piece.infoData = {
    title: remote.title,
    description: remote.description,
    tools: remote.tools,
    year: remote.year,
    category: remote.category,
    tags: remote.tags ?? [],
  };
  piece.renders = remote.renders.map(r => ({
    id: r.id,
    url: assetUrl(r.url)!,
    caption: r.caption,
  }));
  piece.likeCount = remote.likeCount;
  piece.viewerSettings = remote.viewerSettings;
  piece.publishing = {
    visibility: remote.visibility,
    publishedAt: remote.publishedAt,
    isMature: remote.isMature,
    aiGenerated: remote.aiGenerated,
    viewCount: remote.viewCount,
  };
  piece.modelInfo = {
    sourceFormat: remote.sourceFormat,
    version: remote.modelVersion,
    sizeBytes: remote.modelSizeBytes,
    thumbnailUrl: remote.thumbnailUrl,
  };

  return piece;
}

// Formats the server's processing pipeline accepts (a .zip bundles a model
// with its textures / .bin / .mtl files).
export const MODEL_FILE_ACCEPT = '.glb,.gltf,.fbx,.obj,.stl,.blend,.usdz,.usd,.usda,.usdc,.zip';

export function pickModelFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = MODEL_FILE_ACCEPT;
    input.style.display = 'none';

    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      resolve(file);
      document.body.removeChild(input);
    };

    document.body.appendChild(input);
    input.click();
  });
}


export type PickedPortfolioImageResult = {
  image: PortfolioImage;
  file: File;
};

export async function pickPortfolioImage(): Promise<PickedPortfolioImageResult | null> {
  const file = await pickImageFile();
  if (!file) return null;

  const url = URL.createObjectURL(file);
  const caption = prompt('Enter caption for this image:') || 'Untitled';

  return {
    image: {
      id: randomId(),
      url,
      caption
    },
    file
  };
}

/* ---- Helper: open file picker for images ---- */
function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';

    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      resolve(file);
      document.body.removeChild(input);
    };

    document.body.appendChild(input);
    input.click();
  });
}


