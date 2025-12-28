import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ArtworkInfoData } from './types/ArtworkInfoData'
import type { PortfolioPiece } from './types/PortfolioPiece'
import ArtworkInfo from './components/ArtworkInfo';

/* ---- Portfolio item definition ---- */


/* ---- Loader ---- */
const loader = new GLTFLoader();

/* ---- Create ONE portfolio item from a GLTF ---- */
export async function createPortfolioItem(
  scene: THREE.Scene,
  path: string
): Promise<PortfolioPiece> {

  const gltf = await loader.loadAsync(path);

  const root = new THREE.Group();
  root.add(gltf.scene);

  // center the model
  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  const center = bounds.getCenter(new THREE.Vector3());
  gltf.scene.position.sub(center);

  // recompute bounds after centering
  bounds.setFromObject(gltf.scene);

  let emptyArtworkInfo: ArtworkInfoData = {
    title: '',
    description: '',
    tools: [],
    year: '',
    category: '',

  };


  scene.add(root);

  return {
    id: crypto.randomUUID(),
    root: root,
    bounds: bounds,
    infoData: emptyArtworkInfo,
  };
}

// /* ---- Ray vs bounding-box picking ---- */
// export function pickPortfolioItem(
//   raycaster: THREE.Raycaster,
//   items: PortfolioPiece[]
// ): PortfolioPiece | null {

//   const ray = raycaster.ray;

//   for (const item of items) {
//     // transform bounds to world space
//     const worldBounds = item.bounds.clone();
//     worldBounds.applyMatrix4(item.root.matrixWorld);

//     if (ray.intersectsBox(worldBounds)) {
//       return item;
//     }
//   }

//   return null;
// }

export async function pickPortfolioPiece(scene: THREE.Scene): Promise<PortfolioPiece | null> {
  const file = await pickPortfolioFile();
  if (!file) return null;


  const url = URL.createObjectURL(file);
  try {
    const piece = await createPortfolioItem(scene, url);
    piece.infoData.title = prompt('Enter title for this model:') || 'Untitled';


    return piece;
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

