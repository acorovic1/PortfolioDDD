import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import type { PostProcessing } from '@/frontend/inspector/PostProcessing';
import { DEFAULT_CAMERA_FAR, DEFAULT_CAMERA_NEAR } from '@/frontend/three/sceneUtils';
import { createStudioStage, type StudioStage } from '@/frontend/three/studioStage';
import { DEFAULT_LIGHTS_LAYER } from '@/frontend/three/lightLinking';

// The WebGL side of the portfolio scene: renderer, camera, orbit controls
// lights and studio stage (backdrop, floor, shadows), created once per mount
// and kept sized to the container.
export type ThreeViewport = {
  sceneRef: RefObject<THREE.Scene | null>;
  cameraRef: RefObject<THREE.PerspectiveCamera | null>;
  rendererRef: RefObject<THREE.WebGLRenderer | null>;
  controlsRef: RefObject<OrbitControls | null>;
  statsRef: RefObject<Stats | null>;
  // Created lazily by focus mode; disposed here, before the renderer.
  postRef: RefObject<PostProcessing | null>;
  // Backdrop, environment lighting and floor; also the defaults the inspector
  // returns to.
  stageRef: RefObject<StudioStage | null>;
};

export function useThreeViewport(containerRef: RefObject<HTMLDivElement | null>): ThreeViewport {
  const sceneRef = useRef<THREE.Scene>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const rendererRef = useRef<THREE.WebGLRenderer>(null);
  const controlsRef = useRef<OrbitControls>(null);
  const statsRef = useRef<Stats>(null);
  const postRef = useRef<PostProcessing>(null);
  const stageRef = useRef<StudioStage>(null);

  // --- Setup once ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container || rendererRef.current) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, clientWidth / clientHeight, DEFAULT_CAMERA_NEAR, DEFAULT_CAMERA_FAR);
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false; // handled manually, see the wheel-to-zoom effect below
    controlsRef.current = controls;

    statsRef.current = new Stats();

    // The default lights, for models that don't bring their own. On their own
    // layer, so they can be kept off models that do (see lightLinking.ts).
    const light = new THREE.DirectionalLight(0xffffff, 0.75);
    light.position.set(10, 20, 10);
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    light.layers.set(DEFAULT_LIGHTS_LAYER);
    ambient.layers.set(DEFAULT_LIGHTS_LAYER);
    scene.add(light, ambient);

    stageRef.current = createStudioStage(renderer, scene);

    return () => {
      postRef.current?.dispose();
      postRef.current = null;
      stageRef.current?.dispose();
      stageRef.current = null;
      controls.dispose();

      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      statsRef.current = null;
    };
    // Intentionally runs once on mount only: re-running it would tear down
    // and recreate the whole WebGL context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Handle resizes ---
  useEffect(() => {
    if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;

    let resizeTimeout: number;
    const resizeObserver = new ResizeObserver((entries) => {
      clearTimeout(resizeTimeout);
      // Debounced to about one update per frame.
      resizeTimeout = window.setTimeout(() => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (cameraRef.current && rendererRef.current) {
            cameraRef.current.aspect = width / height;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(width, height);
            postRef.current?.setSize(width, height);
          }
        }
      }, 16);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
    };
  }, [containerRef]);

  // --- Wheel-to-zoom: Ctrl+scroll always zooms; plain scroll zooms only once
  //     the viewport has been clicked into, so it doesn't fight page scroll ---
  useEffect(() => {
    const container = containerRef.current;
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!container || !controls || !camera) return;

    let focused = false;

    const setFocused = (value: boolean) => {
      focused = value;
      container.classList.toggle('scene-focused', value);
    };

    const dolly = (deltaY: number) => {
      const zoomScale = Math.pow(0.95, deltaY < 0 ? 1 : -1);
      const offset = camera.position.clone().sub(controls.target);
      const distance = THREE.MathUtils.clamp(offset.length() * zoomScale, controls.minDistance, controls.maxDistance);
      offset.setLength(distance);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !focused) return; // let the page scroll normally
      event.preventDefault();
      dolly(event.deltaY);
    };

    const onPointerDown = (event: PointerEvent) => {
      setFocused(container.contains(event.target as Node));
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointerdown', onPointerDown);

    return () => {
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [containerRef]);

  return { sceneRef, cameraRef, rendererRef, controlsRef, statsRef, postRef, stageRef };
}
