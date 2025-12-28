import * as THREE from 'three';
import type { ArtworkInfoData } from './ArtworkInfoData'

export type PortfolioPiece = {
  id: string;
  root: THREE.Group;   // logical object
  bounds: THREE.Box3;  // local-space bounds
  infoData: ArtworkInfoData;
};