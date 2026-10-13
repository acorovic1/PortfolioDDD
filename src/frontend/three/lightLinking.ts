import * as THREE from 'three';

// Light linking, as in Blender: lights that come inside a model's file light
// only that model, and the scene's default lights don't touch it.
//
// Three.js lights every object with every light the camera can see, and the
// camera sees by layer. So each model with its own lights gets a private
// layer holding just the model and its lights, the default lights sit on a
// layer of their own, and the carousel is drawn in passes: first everything
// shared under the default lights, then each lit model under only its own
// lights. The passes share one depth buffer, so models still hide each other.

// Stage and models without lights.
export const SHARED_LAYER = 0;
// The scene's default lights.
export const DEFAULT_LIGHTS_LAYER = 1;
// Private layers for models that bring lights (Three.js has 32 layers).
const FIRST_LINKED_LAYER = 2;
const LAST_LINKED_LAYER = 31;

export function hasOwnLights(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse(object => {
    if ((object as THREE.Light).isLight) found = true;
  });
  return found;
}

// Puts an object and everything under it on one layer (lights included).
function setLayer(root: THREE.Object3D, layer: number): void {
  root.traverse(object => object.layers.set(layer));
}

export class LightLinker {
  // Root -> its private layer, or null for a model without lights.
  private readonly layers = new Map<THREE.Object3D, number | null>();
  private readonly freeLayers: number[] = [];

  constructor() {
    for (let layer = FIRST_LINKED_LAYER; layer <= LAST_LINKED_LAYER; layer++) this.freeLayers.push(layer);
  }

  // Links newly added models and frees the layers of removed ones.
  sync(roots: THREE.Object3D[]): void {
    const present = new Set(roots);
    for (const [root, layer] of this.layers) {
      if (present.has(root)) continue;
      if (layer !== null) this.freeLayers.push(layer);
      this.layers.delete(root);
    }
    for (const root of roots) {
      if (this.layers.has(root)) continue;
      this.layers.set(root, this.link(root));
    }
  }

  // The model's private layer, or null if it uses the default lights.
  layerOf(root: THREE.Object3D): number | null {
    return this.layers.get(root) ?? null;
  }

  private link(root: THREE.Object3D): number | null {
    if (!hasOwnLights(root)) return null;
    const layer = this.freeLayers.shift();
    if (layer === undefined) {
      // Out of layers (30 lit models in one scene): rather than let this
      // model's lights spill onto everything, it falls back to the defaults.
      root.traverse(object => {
        if ((object as THREE.Light).isLight) object.visible = false;
      });
      return null;
    }
    setLayer(root, layer);
    return layer;
  }

  // Draws the scene: everything shared first, then each visible lit model
  // under its own lights only.
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    const cameraLayers = camera.layers.mask;
    camera.layers.set(SHARED_LAYER);
    camera.layers.enable(DEFAULT_LIGHTS_LAYER);
    renderer.render(scene, camera);

    const linked = [...this.layers].filter(([root, layer]) => layer !== null && root.visible);
    if (linked.length) {
      // Later passes draw over the first: no clearing, and no second backdrop.
      const background = scene.background;
      const autoClear = renderer.autoClear;
      scene.background = null;
      renderer.autoClear = false;
      for (const [, layer] of linked) {
        camera.layers.set(layer!);
        renderer.render(scene, camera);
      }
      scene.background = background;
      renderer.autoClear = autoClear;
    }
    camera.layers.mask = cameraLayers;
  }

  // For a single-pass render of one model (focus mode, where effects run
  // through a composer): the camera sees the shared layer plus either the
  // model's own lights or the default ones.
  focusOn(root: THREE.Object3D, camera: THREE.Camera): void {
    const layer = this.layerOf(root);
    camera.layers.set(SHARED_LAYER);
    camera.layers.enable(layer ?? DEFAULT_LIGHTS_LAYER);
  }
}
