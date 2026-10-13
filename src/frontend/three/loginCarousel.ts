import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import type { Theme } from '@/frontend/contexts/theme-context';

// Decorative carousel behind the sign-in card: eight pieces on pedestals
// circling the origin, turned so the front slot is empty and the card stands
// in it. They stand on a mirror floor ringed with neon. The models are built
// in code, so the login page loads nothing extra.

const COUNT = 8;
const RADIUS = 3.4;
const STEP = (Math.PI * 2) / COUNT;
const AUTO_ADVANCE_SECONDS = 3.2;
const DRAG_RADIANS_PER_PX = 0.006;
const MODEL_RADIUS = 0.52;
// The mirror is a disc; beyond it is plain background, so the floor cover
// must reach full opacity before its edge.
const FLOOR_RADIUS = 14;

// Violet and cyan come from the logo.
const VIOLET = 0xa855f7;
const CYAN = 0x22d3ee;

type Palette = {
  background: string;
  // Tint of the mirror image (overlay blend). The colour is converted to
  // linear, so 0xbcbcbc (linear 0.5) leaves it unchanged; darker dims it.
  mirrorTint: number;
  // How much of the background colour covers the mirror near the ring; it
  // reaches full cover at the floor's edge, so the floor has no visible end.
  floorCover: number;
  pedestal: number;
  haloBlending: THREE.Blending;
  haloOpacity: number;
  backlightOpacity: number;
  beamStrength: number;
  dustOpacity: number;
  shadowOpacity: number;
};

const PALETTES: Record<Theme, Palette> = {
  dark: {
    background: '#07060f', mirrorTint: 0x9a9aa0, floorCover: 0.35, pedestal: 0x15141c,
    haloBlending: THREE.AdditiveBlending, haloOpacity: 1, backlightOpacity: 1, beamStrength: 1, dustOpacity: 0.85, shadowOpacity: 1,
  },
  light: {
    background: '#eeedf6', mirrorTint: 0xbcbcbc, floorCover: 0.55, pedestal: 0xf6f4fc,
    haloBlending: THREE.NormalBlending, haloOpacity: 0.55, backlightOpacity: 0.6, beamStrength: 0.5, dustOpacity: 0.7, shadowOpacity: 0.35,
  },
};

// Ring rotation closest to `rotation` that leaves a gap, not a piece, at the
// front. Gaps sit half a step off the piece angles.
export function nearestGapRotation(rotation: number): number {
  return (Math.round(rotation / STEP - 0.5) + 0.5) * STEP;
}

function vaseGeometry(): THREE.BufferGeometry {
  const profile = [new THREE.Vector2(0, -0.6)];
  for (let k = 0; k <= 24; k++) {
    profile.push(new THREE.Vector2(0.22 + 0.2 * Math.sin(k * 0.28) + 0.05 * Math.sin(k * 0.9), -0.6 + k * 0.05));
  }
  profile.push(new THREE.Vector2(0.17, 0.62));
  return new THREE.LatheGeometry(profile, 64);
}

const PIECES: { geometry: () => THREE.BufferGeometry; material: THREE.MeshStandardMaterialParameters }[] = [
  { geometry: () => new THREE.TorusKnotGeometry(0.5, 0.16, 180, 24), material: { color: 0xc9a35a, metalness: 0.9, roughness: 0.28 } },
  { geometry: vaseGeometry, material: { color: 0x6b8f5e, roughness: 0.65, side: THREE.DoubleSide } },
  { geometry: () => new THREE.IcosahedronGeometry(0.6, 0), material: { color: 0x7dd3fc, roughness: 0.15, metalness: 0.2, flatShading: true } },
  { geometry: () => new THREE.TorusGeometry(0.48, 0.18, 48, 96), material: { color: 0xa855f7, roughness: 0.3, metalness: 0.45 } },
  { geometry: () => new THREE.DodecahedronGeometry(0.6, 0), material: { color: 0xd9a27a, roughness: 0.9, flatShading: true } },
  { geometry: () => new THREE.SphereGeometry(0.55, 64, 48), material: { color: 0xe5e8ee, metalness: 1, roughness: 0.1 } },
  { geometry: () => new THREE.ConeGeometry(0.45, 1.2, 6), material: { color: 0x22d3ee, roughness: 0.4, flatShading: true } },
  { geometry: () => new THREE.OctahedronGeometry(0.62, 0), material: { color: 0xf1f1f1, roughness: 0.8, flatShading: true } },
];

// Centers the geometry and scales it to a common bounding radius.
function normalize(geometry: THREE.BufferGeometry, radius: number): THREE.BufferGeometry {
  geometry.computeBoundingSphere();
  const { center, radius: current } = geometry.boundingSphere!.clone();
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(radius / current, radius / current, radius / current);
  return geometry;
}

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Soft contact shadow under each pedestal.
function shadowTexture(): THREE.Texture {
  return canvasTexture(128, ctx => {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(0,0,0,0.75)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  });
}

// Background colour laid over the mirror: thin near the ring, solid at the
// edge, so the reflection fades out instead of ending in a line.
function floorCoverTexture(color: string, cover: number): THREE.Texture {
  // getHexString() gives sRGB; the r/g/b fields are linear and would come out darker.
  const hex = new THREE.Color(color).getHexString();
  const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',');
  return canvasTexture(512, ctx => {
    const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    gradient.addColorStop(0, `rgba(${rgb},${cover})`);
    gradient.addColorStop(0.3, `rgba(${rgb},${cover})`);
    gradient.addColorStop(0.75, `rgba(${rgb},1)`);
    gradient.addColorStop(1, `rgba(${rgb},1)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
  });
}

// Glow around a neon ring of radius `radius`, drawn on a square plane of
// side `extent` centred on it. Stacked strokes instead of a canvas blur
// filter, which not every browser supports.
function haloTexture(radius: number, extent: number, color: string): THREE.Texture {
  return canvasTexture(1024, ctx => {
    const r = (radius / extent) * 1024;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = color;
    for (let k = 0; k < 14; k++) {
      ctx.globalAlpha = 0.07 * (1 - k / 14);
      ctx.lineWidth = 4 + k * 9;
      ctx.beginPath();
      ctx.arc(512, 512, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

// --- Light beams ---
// A spotlight beam is an open cone, brighter towards its source and faded at
// its silhouette (where the view grazes the surface), so it reads as a soft
// shaft of light rather than a solid shape.
const BEAM_HEIGHT = 4.6;

function beamMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      strength: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying float vHeight;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = viewPosition.xyz;
        vNormal = normalize(normalMatrix * normal);
        vHeight = position.y / ${BEAM_HEIGHT.toFixed(1)} + 0.5;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float strength;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying float vHeight;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(-vViewPosition)));
        // Brighter towards the source, then fading out just before the top so
        // the beam has no hard end.
        float alongBeam = mix(0.03, 0.15, smoothstep(0.0, 0.7, vHeight))
          * (1.0 - smoothstep(0.8, 1.0, vHeight));
        gl_FragColor = vec4(color, pow(facing, 2.0) * alongBeam * strength);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// --- Hall banners ---
// Tall fabric banners hanging in an arc behind the ring, like an exhibition
// hall. The middle of the arc is left empty, behind the card.
const BANNERS = [
  { word: 'MODELS', angle: -50, accent: '#22d3ee' },
  { word: 'RENDERS', angle: -24, accent: '#a855f7' },
  { word: 'TEXTURES', angle: 24, accent: '#22d3ee' },
  { word: 'ANIMATION', angle: 50, accent: '#a855f7' },
];
const BANNER_ARC_RADIUS = 9;
const BANNER_WIDTH = 1.25;
const BANNER_HEIGHT = 3.6;
// Hung from just above the top of the screen, so the rod is never seen but
// the whole face is.
const BANNER_TOP = 5.4;

// The logo is three "D" strokes, each turned a third of a turn; same path,
// transforms and colours as Logo in svg/Icons.tsx (its units: about 240 across).
const LOGO_D = 'M -40 -60 L -40 60 C 20 60, 40 30, 40 0 C 40 -30, 20 -60, -40 -60 Z';
const LOGO_STROKES = [
  { angle: 0, color: '#38bdf8' },
  { angle: 120, color: '#34d399' },
  { angle: 240, color: '#f472b6' },
];

// Banner face: violet fabric with a swallowtail bottom, a neon trim, the word
// running up the banner and the logo near the bottom. Transparent outside
// the banner's outline.
function bannerTexture(word: string, accent: string): THREE.Texture {
  // Same proportions as the banner, 1.25 x 3.6.
  const width = 256;
  const height = 736;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const outline = new Path2D('M 0 0 L 256 0 L 256 736 L 128 670 L 0 736 Z');
  ctx.save();
  ctx.clip(outline);
  const fabric = ctx.createLinearGradient(0, 0, 0, height);
  fabric.addColorStop(0, '#120a2e');
  fabric.addColorStop(0.5, '#2a1260');
  fabric.addColorStop(1, '#3a1a78');
  ctx.fillStyle = fabric;
  ctx.fillRect(0, 0, width, height);
  // Woven texture: faint vertical threads.
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let x = 0; x < width; x += 6) ctx.fillRect(x, 0, 2, height);
  ctx.restore();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D('M 16 16 L 240 16 L 240 704 L 128 646 L 16 704 Z'));

  ctx.save();
  ctx.translate(width / 2, 305);
  ctx.rotate(-Math.PI / 2);
  ctx.font = '600 52px system-ui, "Segoe UI", sans-serif';
  ctx.letterSpacing = '10px';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ece6ff';
  // Long words are squeezed to fit below the part hidden off the top of the
  // screen (most of it on the outer banners, which are nearer the camera).
  const maxLength = 320;
  const length = ctx.measureText(word).width;
  if (length > maxLength) ctx.scale(maxLength / length, maxLength / length);
  ctx.fillText(word, 0, 0);
  ctx.restore();

  const logo = new Path2D(LOGO_D);
  ctx.save();
  ctx.translate(width / 2, 560);
  ctx.scale(0.6, 0.6);
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  for (const { angle, color } of LOGO_STROKES) {
    ctx.save();
    ctx.rotate(THREE.MathUtils.degToRad(angle));
    ctx.translate(0, -25);
    ctx.strokeStyle = color;
    ctx.stroke(logo);
    ctx.restore();
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Large soft light behind the ring: violet in the middle, cyan at the rim.
function backlightTexture(): THREE.Texture {
  return canvasTexture(256, ctx => {
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(124,58,237,0.55)');
    gradient.addColorStop(0.45, 'rgba(168,85,247,0.25)');
    gradient.addColorStop(0.75, 'rgba(34,211,238,0.07)');
    gradient.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
  });
}

// --- Water film on the mirror ---
// Reflector's own shader, with the reflection lookup nudged by a slow
// ambient wobble and by rings spreading from where the pointer crossed the
// floor, as if the mirror had a thin layer of water on it.
const RIPPLE_SLOTS = 8;
const RIPPLE_LIFETIME = 2;
const RIPPLE_INTERVAL = 0.6;
// Minimum distance across the floor between one ripple and the next.
const RIPPLE_SPACING = 1.5;

const WaterReflectorShader = {
  name: 'WaterReflectorShader',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    // Drives the ambient wobble; held at 0 for reduced motion.
    flow: { value: 0 },
    time: { value: 0 },
    // x, y in the mirror's own plane (world x, -z); z is the start time.
    ripples: { value: Array.from({ length: RIPPLE_SLOTS }, () => new THREE.Vector3(0, 0, -100)) },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec2 vPosition;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vPosition = position.xy;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float flow;
    uniform float time;
    uniform vec3 ripples[${RIPPLE_SLOTS}];
    varying vec4 vUv;
    varying vec2 vPosition;
    #include <logdepthbuf_pars_fragment>

    float blendOverlay(float base, float blend) {
      return base < 0.5 ? (2.0 * base * blend) : (1.0 - 2.0 * (1.0 - base) * (1.0 - blend));
    }
    vec3 blendOverlay(vec3 base, vec3 blend) {
      return vec3(blendOverlay(base.r, blend.r), blendOverlay(base.g, blend.g), blendOverlay(base.b, blend.b));
    }

    void main() {
      #include <logdepthbuf_fragment>
      vec2 p = vPosition;
      vec2 offset = vec2(
        sin(p.x * 1.7 + flow * 0.9) + sin(p.y * 2.3 - flow * 0.7 + p.x * 0.5),
        cos(p.y * 1.9 + flow * 0.8) + sin(p.x * 2.1 + p.y * 1.3 - flow * 1.1)
      ) * 0.0025;

      // Each ripple is a ring travelling outward and fading as it ages.
      float crest = 0.0;
      for (int i = 0; i < ${RIPPLE_SLOTS}; i++) {
        float age = time - ripples[i].z;
        if (age < 0.0 || age > ${RIPPLE_LIFETIME.toFixed(1)}) continue;
        vec2 delta = p - ripples[i].xy;
        float r = length(delta);
        float front = r - age * 1.6;
        float wave = sin(front * 18.0) * exp(-front * front * 6.0) * (1.0 - age / ${RIPPLE_LIFETIME.toFixed(1)});
        offset += delta / max(r, 0.001) * wave * 0.012;
        crest += max(wave, 0.0);
      }

      vec4 base = texture2DProj(tDiffuse, vec4(vUv.xy + offset * vUv.w, vUv.zw));
      // Wave crests catch a little light.
      gl_FragColor = vec4(blendOverlay(base.rgb, color) + crest * 0.06, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

// --- Floating dust ---
const DUST_COUNT = 450;
const DUST_BOUNDS = { x: 10, yMin: 0.1, yMax: 5.5, zMin: -9, zMax: 5 };

function dustTexture(): THREE.Texture {
  return canvasTexture(64, ctx => {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  });
}

export type LoginCarousel = {
  resize(width: number, height: number): void;
  setTheme(theme: Theme): void;
  // Pointer position over the canvas, 0..1 from the top-left corner: for
  // parallax and for ripples on the floor.
  setPointer(x: number, y: number): void;
  dragStart(clientX: number): void;
  dragMove(clientX: number): void;
  dragEnd(): void;
  setRunning(running: boolean): void;
  dispose(): void;
};

// Throws if WebGL is unavailable.
export function createLoginCarousel(canvas: HTMLCanvasElement, options: { reducedMotion: boolean }): LoginCarousel {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = environment;
  scene.environmentIntensity = 0.8;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 60);
  scene.add(new THREE.HemisphereLight(0xb4bcff, 0x0b0b0b, 1.2));
  const key = new THREE.SpotLight(0xffffff, 120, 0, 0.55, 0.7, 2);
  key.position.set(0, 6, 7);
  key.target.position.set(0, 0.6, RADIUS);
  scene.add(key, key.target);
  // Neon spill on the pedestals: violet from the left, cyan from the right.
  const spillViolet = new THREE.PointLight(VIOLET, 25, 12, 2);
  spillViolet.position.set(-4.5, 1, 1);
  const spillCyan = new THREE.PointLight(CYAN, 25, 12, 2);
  spillCyan.position.set(4.5, 1, 1);
  scene.add(spillViolet, spillCyan);

  // --- Mirror floor ---
  const mirror = new Reflector(new THREE.CircleGeometry(FLOOR_RADIUS, 96), { clipBias: 0.003, shader: WaterReflectorShader });
  const water = (mirror.material as THREE.ShaderMaterial).uniforms;
  mirror.rotation.x = -Math.PI / 2;
  scene.add(mirror);

  // Not tone mapped, so its edge matches the background colour exactly. The
  // polygon offset keeps it in front of the mirror it lies on, even far away
  // where the depth buffer can't tell the two apart.
  const coverMaterial = new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const cover = new THREE.Mesh(new THREE.CircleGeometry(FLOOR_RADIUS, 96), coverMaterial);
  cover.rotation.x = -Math.PI / 2;
  cover.position.y = 0.001;
  scene.add(cover);

  // --- Neon ---
  const neon = (color: number) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  // Shared per size and colour; the eight pedestal glows use two of them.
  const halos = new Map<string, { material: THREE.MeshBasicMaterial; geometry: THREE.PlaneGeometry }>();
  const addHalo = (parent: THREE.Object3D, radius: number, extent: number, color: string, y: number) => {
    const key = `${radius}/${extent}/${color}`;
    let shared = halos.get(key);
    if (!shared) {
      shared = {
        material: new THREE.MeshBasicMaterial({ map: haloTexture(radius, extent, color), transparent: true, depthWrite: false, toneMapped: false }),
        geometry: new THREE.PlaneGeometry(extent, extent),
      };
      halos.set(key, shared);
    }
    const halo = new THREE.Mesh(shared.geometry, shared.material);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = y;
    parent.add(halo);
  };

  const rim = new THREE.Mesh(new THREE.TorusGeometry(RADIUS + 0.9, 0.025, 8, 256), neon(VIOLET));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.03;
  scene.add(rim);
  addHalo(scene, RADIUS + 0.9, (RADIUS + 2) * 2, '#a855f7', 0.004);

  // Glows that aren't floor halos; they follow the theme the same way.
  const glow = (map: THREE.Texture) =>
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false });

  // Backlight, tall enough to fill the space above the card but fading out
  // before it reaches the floor, so it never meets the floor in a line.
  const backlightMaterial = glow(backlightTexture());
  // Behind the banners, so they stand out against it.
  const backlight = new THREE.Mesh(new THREE.PlaneGeometry(30, 7), backlightMaterial);
  backlight.position.set(0, 3.8, -BANNER_ARC_RADIUS - 1.5);
  scene.add(backlight);
  const glows = [backlightMaterial];
  let backlightOpacity = 1;

  // Each banner hangs from a pivot at its top edge, facing the centre, so
  // swaying rotates it about the point it hangs from.
  const bannerGeometry = new THREE.PlaneGeometry(BANNER_WIDTH, BANNER_HEIGHT);
  bannerGeometry.translate(0, -BANNER_HEIGHT / 2, 0);
  const banners = BANNERS.map(({ word, angle, accent }, i) => {
    const map = bannerTexture(word, accent);
    const material = new THREE.MeshStandardMaterial({
      map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.35,
      roughness: 0.85, alphaTest: 0.5, side: THREE.DoubleSide,
    });
    const a = THREE.MathUtils.degToRad(angle);
    const pivot = new THREE.Group();
    pivot.position.set(Math.sin(a) * BANNER_ARC_RADIUS, BANNER_TOP, -Math.cos(a) * BANNER_ARC_RADIUS);
    pivot.rotation.order = 'YXZ';
    pivot.rotation.y = -a;
    pivot.add(new THREE.Mesh(bannerGeometry, material));
    scene.add(pivot);
    return { pivot, phase: i * 1.7 };
  });

  // Keep the banners out of the mirror: being tall, their reflections reach
  // the bottom of the screen and show mirrored words there.
  const renderReflection = mirror.onBeforeRender;
  mirror.onBeforeRender = (...args) => {
    banners.forEach(({ pivot }) => { pivot.visible = false; });
    renderReflection.apply(mirror, args);
    banners.forEach(({ pivot }) => { pivot.visible = true; });
  };

  // --- Pieces ---
  const pedestalGeometry = new THREE.CylinderGeometry(0.42, 0.48, 0.5, 48);
  const pedestalMaterial = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.5 });
  const shadowMap = shadowTexture();
  const shadowGeometry = new THREE.PlaneGeometry(1.7, 1.7);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false });
  const baseGeometry = new THREE.TorusGeometry(0.5, 0.014, 6, 96);
  const baseMaterials = [neon(CYAN), neon(VIOLET)];
  // Narrow at the top, about pedestal-wide where it meets the floor.
  const beamGeometry = new THREE.CylinderGeometry(0.1, 0.62, BEAM_HEIGHT, 32, 1, true);
  const beamMaterials = [beamMaterial(CYAN), beamMaterial(VIOLET)];

  const ring = new THREE.Group();
  scene.add(ring);
  const models = PIECES.map((piece, i) => {
    const angle = i * STEP;
    const slot = new THREE.Group();
    slot.position.set(Math.sin(angle) * RADIUS, 0, Math.cos(angle) * RADIUS);

    const pedestal = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
    pedestal.position.y = 0.25;
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.003;
    const base = new THREE.Mesh(baseGeometry, baseMaterials[i % 2]);
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.015;
    const model = new THREE.Mesh(normalize(piece.geometry(), MODEL_RADIUS), new THREE.MeshStandardMaterial(piece.material));
    model.position.y = 0.5 + MODEL_RADIUS + 0.02;
    model.rotation.y = angle;

    const beam = new THREE.Mesh(beamGeometry, beamMaterials[i % 2]);
    beam.position.y = BEAM_HEIGHT / 2;

    slot.add(pedestal, shadow, base, model, beam);
    addHalo(slot, 0.5, 2, i % 2 ? '#a855f7' : '#22d3ee', 0.005);
    ring.add(slot);
    return model;
  });

  // --- Floating dust ---
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  const dustColors = new Float32Array(DUST_COUNT * 3);
  const dustTints = [new THREE.Color(VIOLET), new THREE.Color(CYAN), new THREE.Color(0xffffff)];
  const dustDrift = Array.from({ length: DUST_COUNT }, (_, i) => {
    dustPositions[i * 3] = (Math.random() * 2 - 1) * DUST_BOUNDS.x;
    dustPositions[i * 3 + 1] = THREE.MathUtils.lerp(DUST_BOUNDS.yMin, DUST_BOUNDS.yMax, Math.random());
    dustPositions[i * 3 + 2] = THREE.MathUtils.lerp(DUST_BOUNDS.zMin, DUST_BOUNDS.zMax, Math.random());
    dustTints[i % dustTints.length].toArray(dustColors, i * 3);
    return { rise: 0.05 + Math.random() * 0.12, phase: Math.random() * Math.PI * 2 };
  });
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));
  const dustMaterial = new THREE.PointsMaterial({
    size: 0.06, map: dustTexture(), vertexColors: true,
    transparent: true, depthWrite: false, toneMapped: false,
  });
  scene.add(new THREE.Points(dustGeometry, dustMaterial));

  let rotation = STEP / 2;
  let target = rotation;
  let dragging = false;
  let lastX = 0;
  let idle = 0;
  let pointerX = 0.5;
  let parallax = 0;
  let aspect = 1;
  const timer = new THREE.Timer();

  // Ripples start where the pointer crosses the floor, spaced out in time
  // and distance so a moving pointer leaves a trail of rings.
  const raycaster = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const floorHit = new THREE.Vector3();
  const lastRipple = new THREE.Vector3(Infinity, 0, 0);
  let lastRippleTime = -Infinity;
  let nextRippleSlot = 0;
  const addRipple = (x: number, y: number) => {
    raycaster.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), camera);
    if (!raycaster.ray.intersectPlane(floorPlane, floorHit)) return;
    // Beyond this the floor has faded into the background.
    if (floorHit.length() > FLOOR_RADIUS * 0.6) return;
    const now = timer.getElapsed();
    if (now - lastRippleTime < RIPPLE_INTERVAL || floorHit.distanceTo(lastRipple) < RIPPLE_SPACING) return;
    lastRipple.copy(floorHit);
    lastRippleTime = now;
    (water.ripples.value as THREE.Vector3[])[nextRippleSlot].set(floorHit.x, -floorHit.z, now);
    nextRippleSlot = (nextRippleSlot + 1) % RIPPLE_SLOTS;
  };

  const frame = (time: number) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.05);
    if (!dragging) {
      idle += dt;
      if (!options.reducedMotion && idle > AUTO_ADVANCE_SECONDS) {
        idle = 0;
        target += STEP;
      }
      rotation += (target - rotation) * Math.min(1, dt * 3);
    }
    ring.rotation.y = rotation;
    // The backlight breathes slowly.
    const elapsed = timer.getElapsed();
    const breath = options.reducedMotion ? 1 : 0.88 + 0.12 * Math.sin(elapsed * 0.8);
    backlightMaterial.opacity = backlightOpacity * breath;
    // Banners sway a little, as if in a light draught.
    if (!options.reducedMotion) {
      banners.forEach(({ pivot, phase }) => {
        pivot.rotation.x = Math.sin(elapsed * 0.45 + phase) * 0.025;
        pivot.rotation.z = Math.sin(elapsed * 0.6 + phase * 1.3) * 0.012;
      });
    }
    if (!options.reducedMotion) models.forEach(model => { model.rotation.y += dt * 0.6; });

    water.time.value = elapsed;
    if (!options.reducedMotion) water.flow.value = elapsed;

    // Dust rises slowly, wandering a little, and starts again at the bottom.
    if (!options.reducedMotion) {
      dustDrift.forEach(({ rise, phase }, i) => {
        dustPositions[i * 3] += Math.sin(elapsed * 0.3 + phase) * 0.04 * dt;
        dustPositions[i * 3 + 1] += rise * dt;
        dustPositions[i * 3 + 2] += Math.cos(elapsed * 0.25 + phase) * 0.04 * dt;
        if (dustPositions[i * 3 + 1] > DUST_BOUNDS.yMax) dustPositions[i * 3 + 1] = DUST_BOUNDS.yMin;
      });
      dustGeometry.attributes.position.needsUpdate = true;
    }

    parallax += (pointerX - 0.5 - parallax) * Math.min(1, dt * 3);
    // Pull back on portrait screens so the ring still fits the width (never
    // closer than the landscape framing, which squarish views would get).
    const distance = Math.max(10.5, (10.5 / aspect) * 0.8);
    camera.position.set(parallax * 1.2, 2.6, distance);
    camera.lookAt(0, 0.45, 0);
    renderer.render(scene, camera);
  };

  return {
    resize(width, height) {
      if (width === 0 || height === 0) return;
      aspect = width / height;
      renderer.setSize(width, height, false);
      const pixelRatio = renderer.getPixelRatio();
      mirror.getRenderTarget().setSize(Math.round(width * pixelRatio), Math.round(height * pixelRatio));
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      // Resizing clears the canvas, and size changes are reported after this
      // frame was drawn - draw again so a canvas being resized every frame
      // (e.g. the home page's hero growing) never shows blank.
      renderer.render(scene, camera);
    },
    setTheme(theme) {
      const palette = PALETTES[theme];
      scene.background = new THREE.Color(palette.background);
      (mirror.material as THREE.ShaderMaterial).uniforms.color.value.setHex(palette.mirrorTint);
      coverMaterial.map?.dispose();
      coverMaterial.map = floorCoverTexture(palette.background, palette.floorCover);
      coverMaterial.needsUpdate = true;
      pedestalMaterial.color.setHex(palette.pedestal);
      shadowMaterial.opacity = palette.shadowOpacity;
      [...[...halos.values()].map(({ material }) => material), ...glows].forEach(material => {
        material.blending = palette.haloBlending;
        material.opacity = palette.haloOpacity;
        material.needsUpdate = true;
      });
      backlightOpacity = palette.backlightOpacity;
      beamMaterials.forEach(material => {
        material.blending = palette.haloBlending;
        material.uniforms.strength.value = palette.beamStrength;
        material.needsUpdate = true;
      });
      dustMaterial.blending = palette.haloBlending;
      dustMaterial.opacity = palette.dustOpacity;
      dustMaterial.needsUpdate = true;
    },
    setPointer(x, y) {
      pointerX = x;
      addRipple(x, y);
    },
    dragStart(clientX) {
      dragging = true;
      lastX = clientX;
    },
    dragMove(clientX) {
      if (!dragging) return;
      rotation += (clientX - lastX) * DRAG_RADIANS_PER_PX;
      target = rotation;
      lastX = clientX;
    },
    dragEnd() {
      if (!dragging) return;
      dragging = false;
      idle = 0;
      target = nearestGapRotation(rotation);
    },
    setRunning(running) {
      timer.reset();
      renderer.setAnimationLoop(running ? frame : null);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      mirror.dispose();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh && object !== mirror) {
          object.geometry.dispose();
          const material = object.material as THREE.MeshBasicMaterial;
          material.map?.dispose();
          material.dispose();
        }
      });
      mirror.geometry.dispose();
      dustGeometry.dispose();
      dustMaterial.map?.dispose();
      dustMaterial.dispose();
      environment.dispose();
      timer.dispose();
      renderer.dispose();
    },
  };
}
