import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_LIGHTS_LAYER, LightLinker, SHARED_LAYER, hasOwnLights } from './lightLinking';

function model(withLight: boolean): THREE.Group {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    root.add(mesh);
    if (withLight) root.add(new THREE.PointLight());
    return root;
}

function layersOf(root: THREE.Object3D): number[] {
    const masks = new Set<number>();
    root.traverse(object => masks.add(object.layers.mask));
    return [...masks];
}

describe('LightLinker', () => {
    it('leaves a model without lights on the shared layer', () => {
        const linker = new LightLinker();
        const plain = model(false);
        linker.sync([plain]);
        expect(hasOwnLights(plain)).toBe(false);
        expect(linker.layerOf(plain)).toBeNull();
        expect(layersOf(plain)).toEqual([1 << SHARED_LAYER]);
    });

    it('gives each lit model, lights included, a private layer', () => {
        const linker = new LightLinker();
        const a = model(true);
        const b = model(true);
        linker.sync([a, b]);
        const layerA = linker.layerOf(a);
        const layerB = linker.layerOf(b);
        expect(layerA).not.toBeNull();
        expect(layerB).not.toBeNull();
        expect(layerA).not.toBe(layerB);
        expect([SHARED_LAYER, DEFAULT_LIGHTS_LAYER]).not.toContain(layerA);
        expect(layersOf(a)).toEqual([1 << layerA!]);
    });

    it('frees the layer of a removed model for the next one', () => {
        const linker = new LightLinker();
        const first = model(true);
        linker.sync([first]);
        const layer = linker.layerOf(first);

        linker.sync([]);
        expect(linker.layerOf(first)).toBeNull();

        const next = model(true);
        linker.sync([next]);
        // Freed layers go to the back of the queue, but are reused eventually.
        const seen = new Set<number>();
        for (let i = 0; i < 40; i++) {
            const extra = model(true);
            linker.sync([next, extra]);
            seen.add(linker.layerOf(extra)!);
            linker.sync([next]);
        }
        expect(seen.has(layer!)).toBe(true);
    });

    it('turns off the lights of a model it has no layer left for', () => {
        const linker = new LightLinker();
        const models = Array.from({ length: 31 }, () => model(true));
        linker.sync(models);
        const last = models[30];
        expect(linker.layerOf(last)).toBeNull();
        const light = last.children.find(c => (c as THREE.Light).isLight)!;
        expect(light.visible).toBe(false);
    });

    it('in focus, shows a lit model with its own lights and a plain one with the defaults', () => {
        const linker = new LightLinker();
        const lit = model(true);
        const plain = model(false);
        linker.sync([lit, plain]);
        const camera = new THREE.PerspectiveCamera();

        linker.focusOn(lit, camera);
        expect(camera.layers.isEnabled(SHARED_LAYER)).toBe(true);
        expect(camera.layers.isEnabled(linker.layerOf(lit)!)).toBe(true);
        expect(camera.layers.isEnabled(DEFAULT_LIGHTS_LAYER)).toBe(false);

        linker.focusOn(plain, camera);
        expect(camera.layers.isEnabled(SHARED_LAYER)).toBe(true);
        expect(camera.layers.isEnabled(DEFAULT_LIGHTS_LAYER)).toBe(true);
        expect(camera.layers.isEnabled(linker.layerOf(lit)!)).toBe(false);
    });
});
