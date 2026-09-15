import type { Request } from 'express';
import type { PortfolioPiece } from '../../src/types/PortfolioPiece';
import type { ProfileData } from '../../src/types/ProfileData';
import * as Three from 'three';

export interface User {
  id: string;
  email: string;
  username: string;
  name: string;
  password: string;
  createdAt: string;
  profileData: ProfileData;
  scene: Three.Scene;
  artworks: PortfolioPiece[];
}


// export interface Portfolio {
//   userId: string;
//   artworks: PortfolioPiece[];
// }

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
  };
}