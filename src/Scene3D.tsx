import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/Addons.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

import {
  createPortfolioItem,
  pickPortfolioPiece,
  type PortfolioPiece,

} from './PortfolioPiece';





function Scene3D({
  artworks,
  containerRef,
  onArtworkIndexChange,
  onArtworkAdd
}: {
  artworks: PortfolioPiece[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  onArtworkIndexChange?: (index: number) => void;
  onArtworkAdd?: (artwork: PortfolioPiece) => void;
}) {


  //console.log('GAME START ', frontIndex);

  // const containerRef = useRef<HTMLDivElement>(null);

  const sceneRef = useRef<THREE.Scene>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const rendererRef = useRef<THREE.WebGLRenderer>(null);
  const controlsRef = useRef<OrbitControls>(null);
  const statsRef = useRef<Stats>(null);
  const artworksRef = useRef<PortfolioPiece[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  let radius = Math.max(3, 1.5 ** artworks.length);

  const [frontIndex, setFrontIndex] = useState(0);

  // Index change
  useEffect(() => {
    onArtworkIndexChange?.(frontIndex);
  }, [frontIndex, onArtworkIndexChange]);


  // Sync artworksRef with artworks prop
  useEffect(() => {
    // Keep the internal ref in sync, but only update objects that changed
    artworks.forEach((artwork) => {
      if (!artworksRef.current.find(a => a.id === artwork.id)) {
        artworksRef.current.push(artwork);
      }
    });
  }, [artworks]);

  // --- Setup scene once ---
  useEffect(() => {
    if (!containerRef.current || rendererRef.current) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const { clientWidth, clientHeight } = containerRef.current;
    renderer.setSize(clientWidth, clientHeight);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    rendererRef.current = renderer;
    containerRef.current.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(
      45,
      clientWidth / clientHeight,
      0.1,
      1000
    );
    camera.position.y = 0;
    camera.position.z = 20;
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;



    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;

    const stats = new Stats();
    statsRef.current = stats;
    //containerRef.current.appendChild(stats.dom);

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
    let group = new THREE.Group();
    group.add(buttonMesh);
    scene.add(group);

    artworksRef.current.push({ id: 'addButton', root: group, bounds: new THREE.Box3().setFromObject(group) });

    const onResize = () => {
      // if (!containerRef.current) return;

      // const width = containerRef.current.clientWidth;
      // const height = containerRef.current.clientHeight;

      // camera.aspect = width / height;
      // camera.updateProjectionMatrix();
      // renderer.setSize(width, height);
    };

    //window.addEventListener('resize', onResize);
    onResize();

    return () => {
      //  window.removeEventListener('resize', onResize);

      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
      containerRef.current?.removeChild(stats.dom);
    };
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

  // --- Animation loop ---
  useEffect(() => {

    const animate = () => {
      statsRef.current?.update();
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

      if (sceneRef.current && cameraRef.current) {
        rendererRef.current?.render(sceneRef.current, cameraRef.current);
      }
      requestAnimationFrame(animate);
    };
    animate();
  }, []);

  // --- Handle clicks to add new artwork ---
  useEffect(() => {

    <input
      ref={fileInputRef}
      type="file"
      accept=".glb,.gltf"
      style={{ display: 'none' }}
      onChange={async (e) => {
        if (!sceneRef.current) return;
        const file = e.target.files?.[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        const newItem = await createPortfolioItem(sceneRef.current, url);
        artworksRef.current.push(newItem);
        URL.revokeObjectURL(url); // free memory
      }}
    />

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = async (event: MouseEvent) => {
      if (!rendererRef.current || !cameraRef.current) return;
      if (frontIndex !== 0) {
        console.log('Click ignored, frontIndex is not 0:', frontIndex);
        return;
      }

      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);

      let buttonBounds = artworksRef.current[0].bounds.clone();
      buttonBounds.applyMatrix4(artworksRef.current[0].root.matrixWorld);

      if (!raycaster.ray.intersectsBox(buttonBounds)) return;

      const newPiece = await pickPortfolioPiece(sceneRef.current!);
      if (!newPiece) return;

      // Notify parent component instead of updating local ref
      onArtworkAdd?.(newPiece);

      const portfolioPieces = [...artworksRef.current, newPiece];
      let bbMax = 0;

      portfolioPieces.forEach(piece => {
        bbMax = Math.max(bbMax, piece.bounds.getSize(new THREE.Vector3()).length());
      });

      radius = Math.max(3, bbMax * (portfolioPieces.length + 1) / (2 * Math.PI));
      console.log('New radius:', radius);

      // Position in circle
      portfolioPieces.forEach((piece, i) => {
        const angle = (i / portfolioPieces.length) * Math.PI * 2;
        let position = piece.root.position;
        position.x = -radius * Math.sin(angle);
        position.z = radius * Math.cos(angle);
      });

      const offset = portfolioPieces[0].root.position.clone();
      portfolioPieces.forEach((piece) => {
        piece.root.position.sub(offset);
      });

    };

    window.addEventListener('click', onClick);

    return () => {
      window.removeEventListener('click', onClick);
    };
  }, [frontIndex, onArtworkAdd]);


  // --- Sync artworks ---
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;



    // Remove old meshes not in artworks
    artworksRef.current.forEach((piece, index) => {
      if (!artworks.find(a => a.id === piece.id) && piece.id !== 'addButton') {

        scene.remove(piece.root);

        // dispose all geometries and materials inside the group
        piece.root.traverse((obj) => {
          if ((obj as THREE.Mesh).geometry) {
            (obj as THREE.Mesh).geometry.dispose();
          }
          if ((obj as THREE.Mesh).material) {
            const mat = (obj as THREE.Mesh).material;
            if (Array.isArray(mat)) {
              mat.forEach(m => m.dispose());
            } else {
              mat.dispose();
            }
          }
        });


        artworksRef.current.splice(index, 1);
      }
    });

    // Add new meshes
    // artworks.forEach((model, i) => {
    //   if (!artworksRef.current.find(m => m.id === model.id)) {
    //     const mesh =
    //       model.mesh ??
    //       new THREE.Mesh(
    //         new THREE.BoxGeometry(1, i + 1, 1),
    //         new THREE.MeshNormalMaterial()
    //       );
    //     scene.add(mesh);
    //     artworksRef.current.push({ id: model.id, mesh });
    //   }
    // });

    // Position in circle
    const pieces = artworksRef.current.map(m => m.root);
    pieces.forEach((piece, i) => {
      if (!piece.userData.targetPosition) {
        const angle = (i / pieces.length) * Math.PI * 2;
        piece.position.set(radius * Math.sin(angle), 0, radius * Math.cos(angle));
      }
    });
  }, [artworks]);


  const rotateCounterClockwise = () => {
    const meshes = artworksRef.current.map(m => m.root!);
    if (meshes.length === 0) return;
    const positions = meshes.map(m => m.position.clone());
    meshes.forEach((mesh, i) => {
      mesh.userData.targetPosition =
        positions[(i - 1 + meshes.length) % meshes.length].clone();
    });

    setFrontIndex((prev) => (prev + 1) % meshes.length);

  };

  const rotateClockwise = () => {
    const meshes = artworksRef.current.map(m => m.root!);
    if (meshes.length === 0) return;

    const positions = meshes.map(m => m.position.clone());
    meshes.forEach((mesh, i) => {

      mesh.userData.targetPosition =
        positions[(i + 1) % meshes.length].clone();
    });


    setFrontIndex(prev => (prev - 1 + meshes.length) % meshes.length);
  };

  return (

    <>
      {/* <div ref={containerRef} style={{ width: '100%', height: '100%' }} /> */}

      {/* Rotate buttons overlay */}
      <div className="rotateButtons">
        <button onClick={rotateCounterClockwise}>⟲</button>
        <button onClick={rotateClockwise}>⟳</button>
      </div>

      {/* Optional debug info */}
      <div className="info-panel">
        Front index: {frontIndex}
        <br />
        Front piece ID: {artworksRef.current[frontIndex]?.id || 'none'}
        <br />
        Total artworks: {artworks.length}
      </div>
    </>



  );

}

export default Scene3D;



