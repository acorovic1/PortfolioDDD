import { describe, it, expect } from 'vitest';
import { nearestGapRotation } from './loginCarousel';

const STEP = (Math.PI * 2) / 8;

describe('nearestGapRotation', () => {
    it('keeps a rotation that already leaves a gap at the front', () => {
        expect(nearestGapRotation(STEP / 2)).toBeCloseTo(STEP / 2);
        expect(nearestGapRotation(-STEP / 2)).toBeCloseTo(-STEP / 2);
    });

    it('snaps a piece sitting at the front to the closest gap', () => {
        expect(nearestGapRotation(STEP * 0.1)).toBeCloseTo(STEP / 2);
        expect(nearestGapRotation(-STEP * 0.1)).toBeCloseTo(-STEP / 2);
    });

    it('works after several full turns', () => {
        expect(nearestGapRotation(STEP * 17.3)).toBeCloseTo(STEP * 17.5);
    });
});
