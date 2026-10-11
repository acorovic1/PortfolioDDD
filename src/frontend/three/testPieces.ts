import * as THREE from 'three';
import type { PortfolioPiece } from '@/types/PortfolioPiece';

// A piece with a cube model of the given edge length, for three/ tests.
export function cubePiece(id: string, size = 1): PortfolioPiece {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial()));
  return {
    id,
    root,
    bounds: new THREE.Box3().setFromObject(root),
    renders: [],
    infoData: { title: id, description: '', tools: [], year: '', category: '', tags: [] },
    likeCount: 0,
    animations: [],
  };
}
