import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  carouselRadius,
  frontPieceId,
  pieceIndexForObject,
  rotateCarouselTo,
  shiftCarousel,
  slotPosition,
  snapCarousel,
  stepCarousel,
} from './carousel';
import { cubePiece } from './testPieces';

const target = (piece: ReturnType<typeof cubePiece>) => piece.root.userData.targetPosition as THREE.Vector3 | undefined;

describe('carouselRadius', () => {
  it('uses the model size for a single piece', () => {
    const piece = cubePiece('a', 2);
    expect(carouselRadius([piece])).toBeCloseTo(Math.sqrt(12)); // cube diagonal
  });

  it('never packs several pieces tighter than radius 3', () => {
    expect(carouselRadius([cubePiece('a', 0.1), cubePiece('b', 0.1)])).toBe(3);
  });

  it('grows with the number and size of pieces', () => {
    const small = carouselRadius(Array.from({ length: 8 }, (_, i) => cubePiece(`s${i}`, 4)));
    const large = carouselRadius(Array.from({ length: 16 }, (_, i) => cubePiece(`l${i}`, 4)));
    expect(large).toBeGreaterThan(small);
    expect(small).toBeGreaterThan(3);
  });
});

describe('slotPosition', () => {
  it('puts slot 0 front-center on +z and the opposite slot on -z', () => {
    const front = slotPosition(0, 4, 5);
    expect(front.x).toBeCloseTo(0);
    expect(front.z).toBeCloseTo(5);

    const back = slotPosition(2, 4, 5);
    expect(back.x).toBeCloseTo(0);
    expect(back.z).toBeCloseTo(-5);
  });

  it('keeps the given height', () => {
    expect(slotPosition(1, 3, 2, 7).y).toBe(7);
  });
});

describe('snapCarousel', () => {
  it('moves the chosen piece to the front and points every piece at the center', () => {
    const pieces = ['a', 'b', 'c'].map(id => cubePiece(id));
    snapCarousel(pieces, 1, 4);

    expect(pieces[1].root.position.z).toBeCloseTo(4);
    expect(frontPieceId(pieces)).toBe('b');
    for (const piece of pieces) {
      expect(piece.root.position.length()).toBeCloseTo(4);
      // Group.lookAt aims +z at the target: here, toward the origin.
      const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(piece.root.quaternion);
      const toCenter = piece.root.position.clone().negate().normalize();
      expect(facing.dot(toCenter)).toBeCloseTo(1);
    }
  });
});

describe('rotateCarouselTo', () => {
  it('sets targets without moving anything yet', () => {
    const pieces = ['a', 'b', 'c', 'd'].map(id => cubePiece(id));
    snapCarousel(pieces, 0, 4);
    rotateCarouselTo(pieces, 2, 4);

    expect(frontPieceId(pieces)).toBe('c'); // reads targets
    expect(pieces[0].root.position.z).toBeCloseTo(4); // still in place
    expect(target(pieces[2])!.z).toBeCloseTo(4);
  });
});

describe('shiftCarousel', () => {
  it('sends each piece to its neighbour’s position', () => {
    const pieces = ['a', 'b', 'c'].map(id => cubePiece(id));
    snapCarousel(pieces, 0, 4);
    const before = pieces.map(p => p.root.position.clone());

    shiftCarousel(pieces, 1);
    pieces.forEach((piece, i) => {
      expect(target(piece)!.distanceTo(before[(i + 1) % 3])).toBeCloseTo(0);
    });

    shiftCarousel(pieces, -1);
    pieces.forEach((piece, i) => {
      expect(target(piece)!.distanceTo(before[i])).toBeCloseTo(0);
    });
  });

  it('adds up steps taken before the previous one has finished animating', () => {
    const pieces = ['a', 'b', 'c', 'd'].map(id => cubePiece(id));
    snapCarousel(pieces, 0, 4);
    const before = pieces.map(p => p.root.position.clone());

    shiftCarousel(pieces, 1);
    stepCarousel(pieces); // part-way there
    shiftCarousel(pieces, 1);

    pieces.forEach((piece, i) => {
      expect(target(piece)!.distanceTo(before[(i + 2) % 4])).toBeCloseTo(0);
    });
  });
});

describe('stepCarousel', () => {
  it('eases toward the target, then snaps and clears it', () => {
    const piece = cubePiece('a');
    piece.root.userData.targetPosition = new THREE.Vector3(10, 0, 0);

    stepCarousel([piece]);
    expect(piece.root.position.x).toBeCloseTo(1); // 10% of the way

    for (let i = 0; i < 200 && target(piece); i++) stepCarousel([piece]);
    expect(target(piece)).toBeUndefined();
    expect(piece.root.position.x).toBe(10);
  });

  it('leaves pieces without a target alone', () => {
    const piece = cubePiece('a');
    piece.root.position.set(1, 2, 3);
    stepCarousel([piece]);
    expect(piece.root.position.toArray()).toEqual([1, 2, 3]);
  });
});

describe('frontPieceId', () => {
  it('is null for an empty carousel', () => {
    expect(frontPieceId([])).toBeNull();
  });

  it('prefers where a piece is heading over where it is', () => {
    const [a, b] = [cubePiece('a'), cubePiece('b')];
    a.root.position.z = 5;
    b.root.position.z = -5;
    b.root.userData.targetPosition = new THREE.Vector3(0, 0, 6);
    expect(frontPieceId([a, b])).toBe('b');
  });
});

describe('pieceIndexForObject', () => {
  it('finds the piece a nested mesh belongs to', () => {
    const pieces = ['a', 'b'].map(id => cubePiece(id));
    const nested = new THREE.Object3D();
    pieces[1].root.children[0].add(nested);

    expect(pieceIndexForObject(pieces, nested)).toBe(1);
    expect(pieceIndexForObject(pieces, pieces[0].root.children[0])).toBe(0);
  });

  it('returns -1 for objects outside the carousel', () => {
    expect(pieceIndexForObject([cubePiece('a')], new THREE.Mesh())).toBe(-1);
  });
});
