import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ArtworkInfoData } from './ArtworkInfoData'



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
};

export type PickedPortfolioPieceResult = {
  piece: PortfolioPiece;
  file: File;
}


const loader = new GLTFLoader();

export async function createPortfolioItem(
  scene: THREE.Scene,
  path: string
): Promise<PortfolioPiece> {

  const gltf = await loader.loadAsync(path);

  // glTF allows omitting normals (clients then shade flat - GLTFLoader turns
  // on flatShading for those). Normal-based rendering such as the inspector's
  // matcap/normals views and ambient occlusion still needs the attribute.
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && !mesh.geometry.attributes.normal) {
      mesh.geometry.computeVertexNormals();
    }
  });

  const root = new THREE.Group();
  root.add(gltf.scene);

  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  const center = bounds.getCenter(new THREE.Vector3());
  gltf.scene.position.sub(center);

  bounds.setFromObject(gltf.scene);

  const emptyArtworkInfo: ArtworkInfoData = {
    title: '',
    description: '',
    tools: [],
    year: '',
    category: '',

  };

  const emptyRenderImages: PortfolioImage[] = [];


  scene.add(root);

  return {
    id: crypto.randomUUID(),
    root: root,
    bounds: bounds,
    infoData: emptyArtworkInfo,
    renders: emptyRenderImages,
    likeCount: 0,
    animations: gltf.animations,
  };
}

export type RemoteArtwork = {
  id: string;
  title: string;
  description: string;
  year: string;
  category: string;
  tools: string[];
  modelUrl: string;
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
  apiBaseUrl: string,
  remote: RemoteArtwork
): Promise<PortfolioPiece> {
  const piece = await createPortfolioItem(scene, `${apiBaseUrl}${remote.modelUrl}`);

  piece.id = remote.id;
  piece.infoData = {
    title: remote.title,
    description: remote.description,
    tools: remote.tools,
    year: remote.year,
    category: remote.category,
  };
  piece.renders = remote.renders.map(r => ({
    id: r.id,
    url: `${apiBaseUrl}${r.url}`,
    caption: r.caption,
  }));
  piece.likeCount = remote.likeCount;

  return piece;
}

export async function pickPortfolioPiece(scene: THREE.Scene): Promise<PickedPortfolioPieceResult | null> {
  const file = await pickPortfolioFile();
  if (!file) return null;


  const url = URL.createObjectURL(file);
  try {
    const piece = await createPortfolioItem(scene, url);
    piece.infoData.title = prompt('Enter title for this model:') || 'Untitled';


    return { piece, file };
  } finally {
    URL.revokeObjectURL(url); // free memory
  }
}

function pickPortfolioFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.glb,.gltf';
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
      id: crypto.randomUUID(),
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


