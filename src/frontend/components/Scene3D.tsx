import { useRef, useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import type { ArtworkInfoData } from '@/types/ArtworkInfoData'
import { useAuth } from '@/frontend/hooks/useAuth';

import {
  pickPortfolioPiece,
  createPortfolioItemFromRemote,
  type PortfolioPiece,
  type PortfolioImage,
  type RemoteArtwork,
} from '@/types/PortfolioPiece';
import { FocusIcon, CubeIcon } from '@/frontend/svg/Icons';
import InspectorPanel from '@/frontend/components/InspectorPanel';
import { ModelInspector } from '@/frontend/inspector/ModelInspector';
import { PostProcessing, DEFAULT_POST_SETTINGS, type PostSettings } from '@/frontend/inspector/PostProcessing';
import { API_BASE_URL } from '@/frontend/config/api';
import { uploadWithProgress } from '@/frontend/utils/uploadWithProgress';

function countVertices(piece?: PortfolioPiece): number {
  if (!piece) return 0;
  let count = 0;
  piece.root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      count += mesh.geometry.attributes.position?.count ?? 0;
    }
  });
  return count;
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// The model currently opened in the inspector (focus mode).
type FocusSession = {
  piece: PortfolioPiece;
  inspector: ModelInspector;
  // Camera viewing direction when focus began - "reset camera" returns to it.
  entryDirection: THREE.Vector3;
};

function modelSize(piece: PortfolioPiece): number {
  return piece.bounds.getSize(new THREE.Vector3()).length();
}

// Camera distance at which the whole model fits the view with a little margin.
function inspectionDistance(piece: PortfolioPiece, camera: THREE.PerspectiveCamera): number {
  const radius = Math.max(modelSize(piece) / 2, 0.01);
  return radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2);
}

const DEFAULT_CAMERA_NEAR = 0.1;
const DEFAULT_CAMERA_FAR = 1000;

// Fit the clipping planes to the model while inspecting it: depth precision
// with a fixed 0.1-1000 range is too coarse for very large or very small
// models, which breaks depth-based effects like ambient occlusion.
function fitCameraClipping(camera: THREE.PerspectiveCamera, distance: number): void {
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
}

type FocusAnimation = {
  startTime: number;
  duration: number;
  fromCameraPosition: THREE.Vector3;
  toCameraPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
};


function Scene3D({
  artworks,
  containerRef,
  onArtworkIndexChange,
  onArtworkAdd,
  editable = false,
  initialIndex = 0,
  remoteArtworksToLoad = null
}: {
  artworks: PortfolioPiece[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  onArtworkIndexChange?: (index: number) => void;
  onArtworkAdd?: (artwork: PortfolioPiece) => void;
  editable?: boolean;
  initialIndex?: number;
  remoteArtworksToLoad?: RemoteArtwork[] | null;
}) {


  //console.log('GAME START ', frontIndex);

  // const containerRef = useRef<HTMLDivElement>(null);

  const sceneRef = useRef<THREE.Scene>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const rendererRef = useRef<THREE.WebGLRenderer>(null);
  const controlsRef = useRef<OrbitControls>(null);
  const statsRef = useRef<Stats>(null);
  const artworksRef = useRef<PortfolioPiece[]>([]);
  const addButtonRef = useRef<PortfolioPiece | null>(null)

  const radiusRef = useRef(3);
  const focusAnimationRef = useRef<FocusAnimation | null>(null);

  // Focus/inspector mode: the selected model is isolated, framed by the
  // camera and opened in the inspector panel; the carousel stays intact.
  const focusRef = useRef<FocusSession | null>(null);
  const postRef = useRef<PostProcessing | null>(null);
  const postSettingsRef = useRef<PostSettings>(DEFAULT_POST_SETTINGS);
  const [focus, setFocus] = useState<FocusSession | null>(null);
  const [postSettings, setPostSettings] = useState<PostSettings>(DEFAULT_POST_SETTINGS);
  const [autoRotate, setAutoRotate] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);


  const [frontIndex, setFrontIndex] = useState(initialIndex);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const { token } = useAuth();

  // Index change
  useEffect(() => {
    onArtworkIndexChange?.(frontIndex);
  }, [frontIndex, onArtworkIndexChange]);


  // Sync artworksRef with artworks prop
  useEffect(() => {
    // Add any artworks that are new to the bookkeeping ref.
    artworks.forEach((artwork) => {
      if (!artworksRef.current.find(a => a.id === artwork.id)) {
        artworksRef.current.push(artwork);
      }
    });

    // Leave the inspector first if its artwork is the one being removed, so
    // its material swaps are undone before the materials get disposed.
    const focused = focusRef.current;
    if (focused && !artworks.some(a => a.id === focused.piece.id)) {
      exitFocus();
    }

    // Detach and dispose artworks that were removed (e.g. deleted by the user),
    // so they stop rendering and don't leak GPU resources.
    const scene = sceneRef.current;
    artworksRef.current = artworksRef.current.filter(piece => {
      if (artworks.some(a => a.id === piece.id)) return true;

      scene?.remove(piece.root);
      piece.root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach(m => m.dispose());
        else material?.dispose();
      });
      return false;
    });
    // exitFocus only goes through refs/setters, so it never goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artworks]);

  // Load artworks the user already saved previously (e.g. right after login),
  // reconstructing each one's 3D object from its backend model URL.
  useEffect(() => {
    if (!remoteArtworksToLoad || remoteArtworksToLoad.length === 0) return;
    const scene = sceneRef.current;
    if (!scene) return;

    let cancelled = false;

    (async () => {
      for (const remote of remoteArtworksToLoad) {
        if (cancelled) return;
        if (artworks.some(a => a.id === remote.id)) continue; // already loaded

        try {
          const piece = await createPortfolioItemFromRemote(scene, API_BASE_URL, remote);
          if (cancelled) return;

          piece.root.visible = !focusRef.current;
          artworksRef.current.push(piece);

          const pieces = artworksRef.current;
          let bbMax = 0;
          pieces.forEach(p => {
            bbMax = Math.max(bbMax, p.bounds.getSize(new THREE.Vector3()).length());
          });
          radiusRef.current = pieces.length === 1
            ? bbMax
            : Math.max(3, bbMax * (pieces.length + 1) / (2 * Math.PI));

          pieces.forEach((p, i) => {
            const angle = (i / pieces.length) * Math.PI * 2;
            p.root.position.x = -radiusRef.current * Math.sin(angle);
            p.root.position.z = radiusRef.current * Math.cos(angle);
            p.root.lookAt(0, 0, 0);
          });

          onArtworkAdd?.(piece);
        } catch (error) {
          console.error('Failed to load a saved artwork into the scene:', error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally only depends on remoteArtworksToLoad: this should run once
    // as a continuous sequence when the list first arrives, not restart every
    // time onArtworkAdd (below) causes the artworks prop to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteArtworksToLoad]);

  // --- Setup scene once ---
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

    const camera = new THREE.PerspectiveCamera(
      45,
      clientWidth / clientHeight,
      DEFAULT_CAMERA_NEAR,
      DEFAULT_CAMERA_FAR
    );
    camera.position.y = 0;
    camera.position.z = 20;
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false; // handled manually, see wheel-to-zoom effect below
    controlsRef.current = controls;

    const stats = new Stats();
    statsRef.current = stats;

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(10, 20, 10);
    scene.add(light);

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);


    const buttonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );
    buttonMesh.position.set(0, 0, 0);
    const group = new THREE.Group();
    group.add(buttonMesh);

    const emptyArtworkInfo: ArtworkInfoData = {
      title: 'Add Button',
      description: '',
      tools: [],
      year: '',
      category: '',
    };
    const renders: PortfolioImage[] = [];

    addButtonRef.current = {
      id: 'addButton',
      root: group,
      bounds: new THREE.Box3().setFromObject(group),
      infoData: emptyArtworkInfo,
      renders: renders,
      likeCount: 0,
      animations: [],
    };

    // Re-attach artworks that already existed before this mount (e.g. the
    // component remounts whenever the user navigates away and back, which
    // tears down the old THREE.Scene - the artwork Group objects themselves
    // survive in React state, but a fresh Scene starts out empty and never
    // had them added to it).
    if (artworks.length > 0) {
      let bbMax = 0;
      artworks.forEach(piece => {
        if (!scene.children.includes(piece.root)) {
          scene.add(piece.root);
        }
        bbMax = Math.max(bbMax, piece.bounds.getSize(new THREE.Vector3()).length());
      });
      radiusRef.current = artworks.length === 1
        ? bbMax
        : Math.max(3, bbMax * (artworks.length + 1) / (2 * Math.PI));
    }

    return () => {
      // Pieces outlive this scene (they're kept in React state), so a focused
      // one must get its materials/visibility restored before unmounting.
      focusRef.current?.inspector.dispose();
      focusRef.current = null;
      artworksRef.current.forEach(piece => {
        piece.root.visible = true;
      });
      postRef.current?.dispose();
      postRef.current = null;
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
    // Intentionally runs once on mount only: it creates the renderer/scene/
    // camera, so re-running it on every `artworks`/`containerRef` change
    // would tear down and recreate the whole WebGL context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // --- Handle resizes ---
  useEffect(() => {
    if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;

    let resizeTimeout: number;

    const resizeObserver = new ResizeObserver((entries) => {
      // Clear previous timeout
      clearTimeout(resizeTimeout);

      // Debounce resize updates
      resizeTimeout = window.setTimeout(() => {
        for (const entry of entries) {
          const width = entry.contentRect.width;
          const height = entry.contentRect.height;

          if (cameraRef.current && rendererRef.current) {
            cameraRef.current.aspect = width / height;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(width, height);
            postRef.current?.setSize(width, height);
          }
        }
      }, 16); // ~60fps
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
      const distance = THREE.MathUtils.clamp(
        offset.length() * zoomScale,
        controls.minDistance,
        controls.maxDistance
      );
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

  // --- Animation loop ---
  useEffect(() => {
    let frameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      const delta = clock.getDelta();
      statsRef.current?.update();
      focusRef.current?.inspector.update(delta);
      //controls.update();

      // Animate meshes toward target positions
      artworksRef.current.forEach(piece => {
        const target: THREE.Vector3 | undefined = piece.root.userData.targetPosition;

        if (!target) return; // skip if no target

        const position = piece.root.position;


        position.lerp(piece.root.userData.targetPosition, 0.1);
        // snap if close enough
        if (position.distanceTo(piece.root.userData.targetPosition) < 0.01) {
          piece.root.position.copy(piece.root.userData.targetPosition);
          delete piece.root.userData.targetPosition;
        }

        piece.root.lookAt(0, 0, 0);
      });

      // Ease the camera/controls target toward a focused artwork, if animating
      const focusAnim = focusAnimationRef.current;
      if (focusAnim && cameraRef.current && controlsRef.current) {
        const t = Math.min((performance.now() - focusAnim.startTime) / focusAnim.duration, 1);
        const eased = easeInOutQuad(t);
        cameraRef.current.position.lerpVectors(focusAnim.fromCameraPosition, focusAnim.toCameraPosition, eased);
        controlsRef.current.target.lerpVectors(focusAnim.fromTarget, focusAnim.toTarget, eased);
        controlsRef.current.update();
        if (t >= 1) {
          focusAnimationRef.current = null;
        }
      } else if (controlsRef.current?.autoRotate) {
        controlsRef.current.update(delta);
      }

      const post = postRef.current;
      if (focusRef.current && post?.usesComposer) {
        post.render();
      } else if (sceneRef.current && cameraRef.current) {
        rendererRef.current?.render(sceneRef.current, cameraRef.current);
      }
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, []);

  // Ease the camera/controls target toward `piece` at a medium distance
  // scaled to its size, over ~1s, keeping the current viewing angle.
  // Uses the piece's pending targetPosition (if it's mid-rotation) so the
  // camera arrives together with the object, otherwise its current position.
  // `options` overrides the framing - the inspector frames the model tightly
  // and "reset camera" restores a specific viewing direction.
  const startFocusAnimation = (
    piece: PortfolioPiece,
    options: { distance?: number; direction?: THREE.Vector3 } = {}
  ) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const focusPosition: THREE.Vector3 =
      (piece.root.userData.targetPosition as THREE.Vector3 | undefined)?.clone()
      ?? piece.root.position.clone();

    const distance = options.distance ?? Math.max(6, modelSize(piece) * 1.8);

    const direction = options.direction?.clone() ?? camera.position.clone().sub(controls.target);
    if (direction.lengthSq() === 0) direction.set(0, 0, 1);
    direction.normalize().multiplyScalar(distance);

    focusAnimationRef.current = {
      startTime: performance.now(),
      duration: 1000,
      fromCameraPosition: camera.position.clone(),
      toCameraPosition: focusPosition.clone().add(direction),
      fromTarget: controls.target.clone(),
      toTarget: focusPosition,
    };
  };

  // Rotate the carousel so an arbitrary artwork lands front-center, then
  // focus the camera on it - used to jump straight to a specific artwork
  // (e.g. deep-linking from Liked/Saved) rather than stepping one at a time.
  const goToIndex = (index: number) => {
    const meshes = artworksRef.current;
    if (meshes.length === 0 || index < 0 || index >= meshes.length) return;

    const count = meshes.length;
    meshes.forEach((piece, i) => {
      const rotatedIndex = (i - index + count) % count;
      const angle = (rotatedIndex / count) * Math.PI * 2;
      piece.root.userData.targetPosition = new THREE.Vector3(
        -radiusRef.current * Math.sin(angle),
        piece.root.position.y,
        radiusRef.current * Math.cos(angle)
      );
    });

    setFrontIndex(index);
    startFocusAnimation(meshes[index]);
  };

  // --- Focus / inspector mode ---

  // Isolates `piece`, frames it and opens it in the inspector. Only uses refs
  // and state setters, so it's safe to call from long-lived event listeners.
  const enterFocus = (piece: PortfolioPiece) => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (focusRef.current || !renderer || !scene || !camera || !controls) return;

    artworksRef.current.forEach(p => {
      p.root.visible = p === piece;
    });
    if (addButtonRef.current) addButtonRef.current.root.visible = false;

    if (!postRef.current) postRef.current = new PostProcessing(renderer, scene, camera);
    postRef.current.apply(postSettingsRef.current, modelSize(piece));

    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() === 0) direction.set(0, 0, 1);

    fitCameraClipping(camera, inspectionDistance(piece, camera));

    const session: FocusSession = {
      piece,
      inspector: new ModelInspector(piece.root, piece.animations, piece.bounds),
      entryDirection: direction.normalize(),
    };
    focusRef.current = session;
    setFocus(session);

    startFocusAnimation(piece, { distance: inspectionDistance(piece, camera), direction: session.entryDirection });
  };

  const exitFocus = () => {
    const session = focusRef.current;
    if (!session) return;

    session.inspector.dispose();
    focusRef.current = null;
    setFocus(null);

    artworksRef.current.forEach(p => {
      p.root.visible = true;
    });
    if (addButtonRef.current) addButtonRef.current.root.visible = true;
    postRef.current?.reset();

    if (controlsRef.current) controlsRef.current.autoRotate = false;
    setAutoRotate(false);

    const camera = cameraRef.current;
    if (camera) {
      camera.near = DEFAULT_CAMERA_NEAR;
      camera.far = DEFAULT_CAMERA_FAR;
      camera.updateProjectionMatrix();
    }

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    // Back out to the regular carousel framing (if the piece still exists).
    if (artworksRef.current.includes(session.piece)) {
      startFocusAnimation(session.piece);
    }
  };

  const inspectFrontArtwork = () => {
    const frontId = getCurrentFrontPieceId();
    const piece = artworksRef.current.find(p => p.id === frontId);
    if (piece) enterFocus(piece);
  };

  const handlePostSettingsChange = (settings: PostSettings) => {
    postSettingsRef.current = settings;
    setPostSettings(settings);
    const session = focusRef.current;
    if (session) postRef.current?.apply(settings, modelSize(session.piece));
  };

  const toggleAutoRotate = () => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.autoRotate = !controls.autoRotate;
    controls.autoRotateSpeed = 1.5;
    setAutoRotate(controls.autoRotate);
  };

  const resetInspectorCamera = () => {
    const session = focusRef.current;
    const camera = cameraRef.current;
    if (!session || !camera) return;
    startFocusAnimation(session.piece, {
      distance: inspectionDistance(session.piece, camera),
      direction: session.entryDirection,
    });
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      container.requestFullscreen().catch(err => console.error('Fullscreen request failed:', err));
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [containerRef]);

  // Esc leaves the inspector (the browser handles Esc for fullscreen itself).
  useEffect(() => {
    if (!focus) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement) exitFocus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // Double-clicking the front model opens it in the inspector; double-clicking
  // any other model rotates the carousel to it first.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const canvas = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onDoubleClick = (event: MouseEvent) => {
      const camera = cameraRef.current;
      if (focusRef.current || !camera) return;

      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const pieces = artworksRef.current;
      const [hit] = raycaster.intersectObjects(pieces.map(p => p.root), true);
      if (!hit) return;

      const index = pieces.findIndex(p => {
        let node: THREE.Object3D | null = hit.object;
        while (node && node !== p.root) node = node.parent;
        return node === p.root;
      });
      if (index === -1) return;

      if (pieces[index].id === getCurrentFrontPieceId()) {
        enterFocus(pieces[index]);
      } else {
        goToIndex(index);
      }
    };

    canvas.addEventListener('dblclick', onDoubleClick);
    return () => canvas.removeEventListener('dblclick', onDoubleClick);
    // Handlers only go through refs/setters, so binding once is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Which piece is actually front-and-center right now, read from the scene
  // itself rather than the `frontIndex` bookkeeping - the remote-load effect
  // below positions pieces by their own array index independently of
  // `frontIndex`, and on a warm remount (artworks already loaded, positions
  // simply carried over) `frontIndex`'s freshly-seeded value doesn't
  // necessarily describe reality either. Position is the one thing that's
  // always accurate, mid-animation or not.
  const getCurrentFrontPieceId = (): string | null => {
    const meshes = artworksRef.current;
    if (meshes.length === 0) return null;
    let best = meshes[0];
    let bestZ = -Infinity;
    for (const m of meshes) {
      const z = (m.root.userData.targetPosition as THREE.Vector3 | undefined)?.z ?? m.root.position.z;
      if (z > bestZ) {
        bestZ = z;
        best = m;
      }
    }
    return best.id;
  };

  // Keep the carousel's front-facing artwork in sync with the selected index
  // whenever it points at a different artwork than what's actually front -
  // covers both a deep link resolving once its artwork loads, and jumping
  // straight to an artwork on a remount that already has it loaded.
  useEffect(() => {
    const targetId = artworks[initialIndex]?.id;
    if (!targetId) return;

    const targetRefIndex = artworksRef.current.findIndex(p => p.id === targetId);
    if (targetRefIndex === -1) return; // not loaded into the scene yet

    if (getCurrentFrontPieceId() === targetId) return;
    goToIndex(targetRefIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIndex, artworks]);

  // --- Handle clicks to add new artwork ---
  useEffect(() => {



    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = async (event: MouseEvent) => {
      if (!editable || focusRef.current) return;
      if (!rendererRef.current || !cameraRef.current || !addButtonRef.current) return;

      // if (frontIndex !== 0) {
      //   console.log('Click ignored, frontIndex is not 0:', frontIndex);
      //   return;
      // }

      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);

      const buttonBounds = addButtonRef.current.bounds.clone();
      buttonBounds.applyMatrix4(addButtonRef.current.root.matrixWorld);

      if (!raycaster.ray.intersectsBox(buttonBounds)) return;

      const result = await pickPortfolioPiece(sceneRef.current!);
      if (!result) return;

      const { piece: newPiece, file: newFile } = result;
      console.log(newPiece.infoData.title, " <--- new object title")

      const formData = new FormData();
      formData.append('model', newFile);
      formData.append('title', newPiece.infoData.title);

      try {
        setUploadProgress(0);
        const uploadRes = await uploadWithProgress(
          `${API_BASE_URL}/api/portfolio/artworks`,
          formData,
          { Authorization: `Bearer ${token}` },
          (percent) => setUploadProgress(percent)
        );

        if (uploadRes.ok) {
          const saved = uploadRes.body as { id: string };
          // Adopt the backend's id so later updates (renders, info edits, delete)
          // can be persisted against the same artwork record.
          newPiece.id = saved.id;
        } else {
          console.error('Failed to persist artwork to backend:', uploadRes.status);
        }
      } catch (error) {
        console.error('Failed to persist artwork to backend:', error);
      } finally {
        setUploadProgress(null);
      }

      // Notify parent component instead of updating local ref

      onArtworkAdd?.(newPiece);

      const portfolioPieces = [...artworksRef.current, newPiece];
      let bbMax = 0;

      portfolioPieces.forEach(piece => {
        bbMax = Math.max(bbMax, piece.bounds.getSize(new THREE.Vector3()).length());
      });

      radiusRef.current = portfolioPieces.length === 1
        ? bbMax
        : Math.max(3, bbMax * (portfolioPieces.length + 1) / (2 * Math.PI));
      console.log('New radius:', radiusRef.current);

      // Rotate everything so the new piece lands front-center (angle 0);
      // existing artworks ease smoothly into their shifted slot, the new
      // piece simply appears already in its final spot.
      const pieceCount = portfolioPieces.length;
      newPiece.root.position.x = 0;
      newPiece.root.position.z = radiusRef.current;

      artworksRef.current.forEach((piece, i) => {
        const angle = ((i + 1) / pieceCount) * Math.PI * 2;
        piece.root.userData.targetPosition = new THREE.Vector3(
          -radiusRef.current * Math.sin(angle),
          piece.root.position.y,
          radiusRef.current * Math.cos(angle)
        );
      });

      setFrontIndex(artworksRef.current.length);
      startFocusAnimation(newPiece);
    };

    window.addEventListener('click', onClick);

    return () => {
      window.removeEventListener('click', onClick);
    };
  }, [onArtworkAdd, token, editable]);

  // Show/hide button based on editable mode
  useEffect(() => {
    if (!sceneRef.current) return;


    if (!addButtonRef.current) return;

    if (editable) {
      if (!sceneRef.current.children.includes(addButtonRef.current.root)) {
        sceneRef.current.add(addButtonRef.current.root);
      }
      // Add button is fixed at the center, excluded from the rotating circle.
      addButtonRef.current.root.position.set(0, 0, 0);
      addButtonRef.current.root.visible = !focusRef.current;
    } else {
      sceneRef.current.remove(addButtonRef.current.root);
    }

    const circlePieces = [...artworksRef.current];
    const count = circlePieces.length;

    circlePieces.forEach((piece, i) => {
      const rotatedIndex = (i - frontIndex + count) % count;
      const angle = (rotatedIndex / count) * Math.PI * 2;
      const position = piece.root.position;
      position.x = -radiusRef.current * Math.sin(angle);
      position.z = radiusRef.current * Math.cos(angle);
    });
    // Intentionally only reacts to `editable` toggling (which adds/removes
    // the center button and needs pieces to reflow around it) - it snaps
    // positions instantly, so also depending on `frontIndex` would fight the
    // smooth lerp animation that rotate/goToIndex already drive on every turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);


  // Rotate the carousel of artworks. The add-button is fixed at the center
  // and never participates in rotation.
  const rotateCounterClockwise = () => {
    const meshes = artworksRef.current;
    if (meshes.length === 0) return;

    const positions = meshes.map(m => m.root.position.clone());
    meshes.forEach((mesh, i) => {
      mesh.root.userData.targetPosition =
        positions[(i - 1 + meshes.length) % meshes.length].clone();
    });

    const newFrontIndex = (frontIndex + 1) % meshes.length;
    setFrontIndex(newFrontIndex);
    startFocusAnimation(meshes[newFrontIndex]);
  };

  const rotateClockwise = () => {
    const meshes = artworksRef.current;
    if (meshes.length === 0) return;

    const positions = meshes.map(m => m.root.position.clone());
    meshes.forEach((mesh, i) => {
      mesh.root.userData.targetPosition = positions[(i + 1) % meshes.length].clone();
    });

    const newFrontIndex = (frontIndex - 1 + meshes.length) % meshes.length;
    setFrontIndex(newFrontIndex);
    startFocusAnimation(meshes[newFrontIndex]);
  };

  // Center the camera on the currently active artwork.
  const focusOnActiveArtwork = () => {
    const piece = artworksRef.current[frontIndex];
    if (!piece) return;
    startFocusAnimation(piece);
  };

  const analytics = useMemo(() => {
    const totalRenders = artworks.reduce((sum, a) => sum + a.renders.length, 0);
    const frontArtwork = artworks[frontIndex];

    return {
      totalRenders,
      vertexCount: countVertices(frontArtwork),
      frontTitle: frontArtwork?.infoData.title || '—',
    };
  }, [artworks, frontIndex]);

  return (

    <>
      {/* <div ref={containerRef} style={{ width: '100%', height: '100%' }} /> */}

      {focus ? (
        <InspectorPanel
          key={focus.piece.id}
          title={artworks.find(a => a.id === focus.piece.id)?.infoData.title ?? focus.piece.infoData.title}
          inspector={focus.inspector}
          postSettings={postSettings}
          onPostSettingsChange={handlePostSettingsChange}
          autoRotate={autoRotate}
          onToggleAutoRotate={toggleAutoRotate}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onResetCamera={resetInspectorCamera}
          onExit={exitFocus}
        />
      ) : (
        <>
          {/* Rotate buttons overlay */}
          <div className="rotateButtons">
            <button onClick={rotateCounterClockwise} title="Rotate carousel counter-clockwise">⟲</button>
            <button onClick={rotateClockwise} title="Rotate carousel clockwise">⟳</button>
            <button onClick={focusOnActiveArtwork} title="Center camera on active artwork">
              <FocusIcon />
            </button>
            <button
              className="inspect-btn"
              onClick={inspectFrontArtwork}
              disabled={artworks.length === 0}
              title="Inspect the front model (or double-click it)"
            >
              <CubeIcon />
              Inspect
            </button>
          </div>

          <div className="controls-hint">
            <div>Drag to rotate view</div>
            <div>Right-click + drag to pan</div>
            <div>Ctrl + Scroll to zoom, or click here first</div>
            <div>Double-click the front model to inspect it</div>
          </div>
        </>
      )}

      {uploadProgress !== null && (
        <div className="upload-progress-overlay">
          <div className="upload-progress-label">Uploading model... {uploadProgress}%</div>
          <div className="upload-progress-track">
            <div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {/* Analytics panel, edit mode only */}
      {editable && !focus && (
        <div className="info-panel">
          <h4 className="info-panel-title">Portfolio Analytics</h4>
          <div className="info-panel-row">
            <span>Current artwork</span>
            <span>{analytics.frontTitle}</span>
          </div>
          <div className="info-panel-row">
            <span>Position</span>
            <span>{artworks.length > 0 ? frontIndex + 1 : 0} / {artworks.length}</span>
          </div>
          <div className="info-panel-row">
            <span>Total artworks</span>
            <span>{artworks.length}</span>
          </div>
          <div className="info-panel-row">
            <span>Total renders</span>
            <span>{analytics.totalRenders}</span>
          </div>
          <div className="info-panel-row">
            <span>Number of vertices</span>
            <span>{analytics.vertexCount.toLocaleString()}</span>
          </div>
        </div>
      )}
    </>



  );

}

export default Scene3D;



