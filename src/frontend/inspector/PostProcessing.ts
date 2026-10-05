import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type ToneMappingOption = 'none' | 'aces' | 'agx' | 'neutral';

export type PostSettings = {
  environment: boolean;
  toneMapping: ToneMappingOption;
  exposure: number;
  ambientOcclusion: boolean;
  bloom: boolean;
  bloomStrength: number;
  vignette: boolean;
};

export const DEFAULT_POST_SETTINGS: PostSettings = {
  environment: true,
  toneMapping: 'aces',
  exposure: 1,
  ambientOcclusion: false,
  bloom: false,
  bloomStrength: 0.35,
  vignette: false,
};

const TONE_MAPPINGS: Record<ToneMappingOption, THREE.ToneMapping> = {
  none: THREE.NoToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
};

// Inspector-only rendering pipeline: studio environment lighting, tone mapping
// and screen-space effects. Built lazily the first time a model is focused and
// fully reverted (reset()) when leaving focus, so the carousel keeps rendering
// exactly as before.
export class PostProcessing {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly composer: EffectComposer;
  private readonly aoPass: GTAOPass;
  private readonly bloomPass: UnrealBloomPass;
  private readonly vignettePass: ShaderPass;
  private environmentTexture: THREE.Texture | null = null;
  private settings: PostSettings = DEFAULT_POST_SETTINGS;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer = renderer;
    this.scene = scene;

    const size = renderer.getSize(new THREE.Vector2());
    const pixelRatio = renderer.getPixelRatio();
    // Multisampled target, so going through the composer doesn't lose the
    // antialiasing the default framebuffer had.
    const target = new THREE.WebGLRenderTarget(size.x * pixelRatio, size.y * pixelRatio, {
      type: THREE.HalfFloatType,
      samples: 4,
    });

    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));

    this.aoPass = new GTAOPass(scene, camera, size.x, size.y);
    this.aoPass.enabled = false;
    this.composer.addPass(this.aoPass);

    this.bloomPass = new UnrealBloomPass(size, DEFAULT_POST_SETTINGS.bloomStrength, 0.4, 0.9);
    this.bloomPass.enabled = false;
    this.composer.addPass(this.bloomPass);

    this.composer.addPass(new OutputPass());

    // After the output pass, so it darkens the final display-space image
    // (darkness above 1 would push edges negative and tone-map to grey).
    this.vignettePass = new ShaderPass(VignetteShader);
    this.vignettePass.uniforms.offset.value = 1.0;
    this.vignettePass.uniforms.darkness.value = 1.0;
    this.vignettePass.enabled = false;
    this.composer.addPass(this.vignettePass);
  }

  // `modelSize` is the focused model's bounding-box diagonal.
  apply(settings: PostSettings, modelSize: number): void {
    this.settings = settings;

    this.renderer.toneMapping = TONE_MAPPINGS[settings.toneMapping];
    this.renderer.toneMappingExposure = settings.exposure;
    this.scene.environment = settings.environment ? this.getEnvironment() : null;

    this.aoPass.enabled = settings.ambientOcclusion;
    // GTAO's radius/thickness are in world units; their defaults suit a model
    // a few units across, so scale them to keep occlusion size-independent.
    this.aoPass.updateGtaoMaterial({
      radius: modelSize * 0.08,
      thickness: modelSize * 0.3,
      scale: 1,
    });

    this.bloomPass.enabled = settings.bloom;
    this.bloomPass.strength = settings.bloomStrength;

    this.vignettePass.enabled = settings.vignette;
  }

  // Tone mapping and environment work without the composer; it's only needed
  // once a screen-space pass is switched on.
  get usesComposer(): boolean {
    return this.settings.ambientOcclusion || this.settings.bloom || this.settings.vignette;
  }

  render(): void {
    this.composer.render();
  }

  setSize(width: number, height: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
  }

  // Back to the plain carousel look.
  reset(): void {
    this.settings = { ...DEFAULT_POST_SETTINGS, ambientOcclusion: false, bloom: false, vignette: false };
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.scene.environment = null;
  }

  dispose(): void {
    this.reset();
    this.composer.dispose();
    this.aoPass.dispose();
    this.bloomPass.dispose();
    this.environmentTexture?.dispose();
    this.environmentTexture = null;
  }

  private getEnvironment(): THREE.Texture {
    if (!this.environmentTexture) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const room = new RoomEnvironment();
      this.environmentTexture = pmrem.fromScene(room, 0.04).texture;
      room.dispose();
      pmrem.dispose();
    }
    return this.environmentTexture;
  }
}
