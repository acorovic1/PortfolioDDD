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

  const root = new THREE.Group();
  root.add(gltf.scene);

  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  const center = bounds.getCenter(new THREE.Vector3());
  gltf.scene.position.sub(center);

  bounds.setFromObject(gltf.scene);

  let emptyArtworkInfo: ArtworkInfoData = {
    title: '',
    description: '',
    tools: [],
    year: '',
    category: '',

  };

  let emptyRenderImages: PortfolioImage[] = [];


  scene.add(root);

  return {
    id: crypto.randomUUID(),
    root: root,
    bounds: bounds,
    infoData: emptyArtworkInfo,
    renders: emptyRenderImages,
  };
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


let nextImageId = 1; // simple numeric ID generator

export async function pickPortfolioImage(): Promise<PortfolioImage | null> {
  const file = await pickImageFile();
  if (!file) return null;

  const url = URL.createObjectURL(file);
  const caption = prompt('Enter caption for this image:') || 'Untitled';

  return {
    id: (nextImageId++).toString(),
    url,
    caption
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


