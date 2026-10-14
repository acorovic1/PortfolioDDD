import * as THREE from 'three';
import type { ArtworkInfoData } from './ArtworkInfoData'
import { getGLTFLoader } from '@/frontend/three/gltfLoader';
import { assetUrl } from '@/frontend/utils/api';
import type { ViewerSettings } from '@/frontend/inspector/PostProcessing';
import { modelPivot, updatePieceBounds } from '@/frontend/three/modelPivot';
import { createEaselCanvas, DEFAULT_CANVAS, VIDEO_CANVAS_SIZE, type CanvasSettings } from '@/frontend/three/easelCanvas';
import { resizedUrl } from '@/frontend/utils/images';

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
  // Set for 2D and video artworks: shown as a canvas on an easel, opened in
  // the image viewer (or video player) instead of the inspector.
  image?: PieceImage;
};

export type PieceImage = {
  // The full-size original (for a video artwork, the video file).
  url: string;
  // In pixels (a video's frame size).
  width: number;
  height: number;
  canvas: CanvasSettings;
  // Set for video artworks.
  video?: PieceVideo;
};

export type PieceVideo = {
  // Plays (muted, looping) on the easel; the carousel starts and stops it.
  element: HTMLVideoElement;
  // Seconds.
  duration: number;
  // A still of the video, for places that show images only.
  posterUrl: string | null;
};

export type ArtworkKind = 'model' | 'image' | 'video';

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
  // Unit quaternion [x, y, z, w] the artist turned the model by; null = as uploaded.
  modelRotation?: [number, number, number, number] | null;
  // Absent on records from before 2D artworks existed (= 'model').
  kind?: ArtworkKind;
  // 2D artworks: the original image, its size in pixels, and its canvas.
  imageUrl?: string | null;
  // Video artworks: the video and its length in seconds (imageWidth/
  // imageHeight are its frame size, and they have a canvas too).
  videoUrl?: string | null;
  videoDuration?: number | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  canvas?: CanvasSettings | null;
  renders: { id: string; url: string; caption: string }[];
  likeCount: number;
  // Populated by endpoints that can return artworks belonging to anyone
  // (e.g. resolving a liked-posts or saved-collection list).
  username?: string;
};

// Whether the artwork has something to show yet (a processed model, or the
// image or video of a 2D/video artwork).
export function isArtworkReady(remote: RemoteArtwork): boolean {
  if (remote.kind === 'image') return !!remote.imageUrl;
  if (remote.kind === 'video') return !!remote.videoUrl;
  return !!remote.modelUrl;
}

// The texture on the easel: a resized variant, plenty for the carousel (the
// image viewer loads the original).
const EASEL_IMAGE_WIDTH = 1920;

// A 2D artwork: its image on a canvas, standing on an easel.
async function createImagePortfolioItem(scene: THREE.Scene, remote: RemoteArtwork): Promise<PortfolioPiece> {
  const url = assetUrl(remote.imageUrl!)!;
  const texture = await new THREE.TextureLoader().loadAsync(resizedUrl(url, EASEL_IMAGE_WIDTH));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const loaded = texture.image as { width: number; height: number };
  const width = remote.imageWidth ?? loaded.width;
  const height = remote.imageHeight ?? loaded.height;
  const canvas: CanvasSettings = { ...DEFAULT_CANVAS, ...remote.canvas };

  const root = new THREE.Group();
  root.add(createEaselCanvas(texture, width, height, canvas));
  scene.add(root);

  return {
    id: randomId(),
    root,
    bounds: new THREE.Box3().setFromObject(root),
    infoData: { title: '', description: '', tools: [], year: '', category: '', tags: [] },
    renders: [],
    likeCount: 0,
    animations: [],
    image: { url, width, height, canvas },
  };
}

// A muted, looping video, loaded far enough to show its first frame.
function loadVideoElement(url: string): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  // Read by WebGL, so it must be fetched with CORS (like image textures).
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  return new Promise((resolve, reject) => {
    video.addEventListener('loadeddata', () => resolve(video), { once: true });
    video.addEventListener('error', () => reject(new Error(`Failed to load the video ${url}`)), { once: true });
    video.src = url;
  });
}

// A video artwork: the video playing on a canvas on an easel. It starts
// paused; the carousel plays the one in front.
async function createVideoPortfolioItem(scene: THREE.Scene, remote: RemoteArtwork): Promise<PortfolioPiece> {
  const url = assetUrl(remote.videoUrl!)!;
  const element = await loadVideoElement(url);
  const texture = new THREE.VideoTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;

  const width = remote.imageWidth ?? element.videoWidth;
  const height = remote.imageHeight ?? element.videoHeight;
  const canvas: CanvasSettings = { ...DEFAULT_CANVAS, ...remote.canvas };

  const root = new THREE.Group();
  root.add(createEaselCanvas(texture, width, height, canvas, VIDEO_CANVAS_SIZE));
  // Called by disposeObject(): stop the video and let go of its data.
  root.userData.onDispose = () => {
    element.pause();
    element.removeAttribute('src');
    element.load();
  };
  scene.add(root);

  return {
    id: randomId(),
    root,
    bounds: new THREE.Box3().setFromObject(root),
    infoData: { title: '', description: '', tools: [], year: '', category: '', tags: [] },
    renders: [],
    likeCount: 0,
    animations: [],
    image: {
      url,
      width,
      height,
      canvas,
      video: {
        element,
        duration: remote.videoDuration ?? element.duration,
        posterUrl: assetUrl(remote.thumbnailUrl),
      },
    },
  };
}

// Reconstructs a PortfolioPiece from a backend artwork record (used to load a
// user's previously-saved portfolio into the 3D scene, e.g. after login).
export async function createPortfolioItemFromRemote(
  scene: THREE.Scene,
  remote: RemoteArtwork
): Promise<PortfolioPiece> {
  // 2D and video artworks stand on an easel; neither has a model.
  const isImage = remote.kind === 'image' || remote.kind === 'video';
  const piece = remote.kind === 'video'
    ? await createVideoPortfolioItem(scene, remote)
    : isImage
      ? await createImagePortfolioItem(scene, remote)
      : await createPortfolioItem(scene, assetUrl(remote.modelUrl)!);

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
  if (remote.modelRotation && !isImage) {
    modelPivot(piece).quaternion.fromArray(remote.modelRotation).normalize();
    updatePieceBounds(piece);
  }
  piece.publishing = {
    visibility: remote.visibility,
    publishedAt: remote.publishedAt,
    isMature: remote.isMature,
    aiGenerated: remote.aiGenerated,
    viewCount: remote.viewCount,
  };
  // 2D artworks have no model file.
  if (!isImage) {
    piece.modelInfo = {
      sourceFormat: remote.sourceFormat,
      version: remote.modelVersion,
      sizeBytes: remote.modelSizeBytes,
      thumbnailUrl: remote.thumbnailUrl,
    };
  }

  return piece;
}

// Formats the server's processing pipeline accepts (a .zip bundles a model
// with its textures / .bin / .mtl files).
export const MODEL_FILE_ACCEPT = '.glb,.gltf,.obj,.stl,.zip';
// Images become 2D artworks.
export const IMAGE_FILE_ACCEPT = '.png,.jpg,.jpeg,.webp';
// Videos become video artworks (or renders). Stored as uploaded, so only
// formats browsers play.
export const VIDEO_FILE_ACCEPT = '.mp4,.webm';

export function isImageFile(file: File): boolean {
  return /\.(png|jpe?g|webp)$/i.test(file.name);
}

export function isVideoFile(file: File): boolean {
  return /\.(mp4|webm)$/i.test(file.name);
}

// Whether a stored file (e.g. a render) is a video.
export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm)(\?|#|$)/i.test(url);
}

// The picture for an artwork's card: its first render that's an image (not a
// video), else its thumbnail.
export function coverImageUrl(remote: Pick<RemoteArtwork, 'renders' | 'thumbnailUrl'>): string | null {
  return remote.renders.find(render => !isVideoUrl(render.url))?.url ?? remote.thumbnailUrl ?? null;
}

// `accept` defaults to models only (e.g. a new version of a model).
export function pickModelFile(accept = MODEL_FILE_ACCEPT): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
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


/* ---- File picker for renders (images or videos) ---- */
export function pickRenderFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `image/*,${VIDEO_FILE_ACCEPT}`;
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


