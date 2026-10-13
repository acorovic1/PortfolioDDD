import { describe, it, expect } from 'vitest';
import { shadowShape } from './studioStage';

describe('shadowShape', () => {
    it('is a tight, full-strength patch for a model standing on the floor', () => {
        const { size, strength } = shadowShape(2, 4, 0);
        expect(size).toBeCloseTo(2.3);
        expect(strength).toBe(1);
    });

    it('widens and fades as the model floats higher', () => {
        const low = shadowShape(2, 4, 1);
        const high = shadowShape(2, 4, 4);
        expect(high.size).toBeGreaterThan(low.size);
        expect(high.strength).toBeLessThan(low.strength);
        expect(high.strength).toBeGreaterThan(0);
    });

    it('scales with the model, so the same proportions give the same look', () => {
        const small = shadowShape(1, 2, 1);
        const large = shadowShape(100, 200, 100);
        expect(large.size / small.size).toBeCloseTo(100);
        expect(large.strength).toBeCloseTo(small.strength);
    });
});
