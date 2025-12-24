import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/Addons.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

import {
  createPortfolioItem,
  pickPortfolioPiece,
  type PortfolioPiece,

} from './PortfolioPiece';




function Scene3D({ artworks }: { artworks: PortfolioPiece[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const sceneRef = useRef<THREE.Scene>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const rendererRef = useRef<THREE.WebGLRenderer>(null);
  const controlsRef = useRef<OrbitControls>(null);
  const artworksRef = useRef<PortfolioPiece[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  let radius = Math.max(3, 1.5 ** artworks.length);

  // --- Setup scene once ---
  useEffect(() => {
    if (!containerRef.current || rendererRef.current) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.y = 0;
    camera.position.z = 20;
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    rendererRef.current = renderer;
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;

    const stats = new Stats();
    containerRef.current.appendChild(stats.dom);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(10, 20, 10);
    scene.add(light);

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);


    // Add the yellow sphere (addButton)
    const buttonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );
    buttonMesh.position.set(0, 0, 0);
    let group = new THREE.Group();
    group.add(buttonMesh);
    scene.add(group);

    artworksRef.current.push({ id: 'addButton', root: group, bounds: new THREE.Box3().setFromObject(group) });

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


    //console.log('HELLOOOO');
    const onClick = async (event: MouseEvent) => {
      //console.log('Mouse clicked');
      if (!rendererRef.current || !cameraRef.current) return;
      //console.log('HOOOP');


      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);

      // Only check the button
      //const buttonModels = artworksRef.current.filter(m => m.isButton).map(m => m.mesh!);
      // const intersects = raycaster.intersectObjects(sceneRef.current!.children);


      let buttonBounds = artworksRef.current[0].bounds.clone();
      buttonBounds.applyMatrix4(artworksRef.current[0].root.matrixWorld);

      // if (intersects.length > 0) {

      if (!raycaster.ray.intersectsBox(buttonBounds)) return;

      //console.log('Add button Intersected');
      // Add new cube
      //openFilePicker();
      //let newItem: PortfolioPiece = await createPortfolioItem(sceneRef.current!, '/models/Monkeys.glb');

      //artworksRef.current.push(newItem);
      const newPiece = await pickPortfolioPiece(sceneRef.current!);
      if (newPiece) {
        artworksRef.current.push(newPiece);
      }
      // const cube = new THREE.Mesh(
      //   new THREE.BoxGeometry(1, artworksRef.current.length + 1, 1),
      //   new THREE.MeshNormalMaterial()
      // );
      // sceneRef.current!.add(cube);
      //artworksRef.current.push({ id: 'cube_' + Date.now(), mesh: cube });


      radius = Math.max(3, radius * artworksRef.current.length / (artworksRef.current.length - 1));
      console.log('New radius:', radius);

      //let group = new THREE.Group();
      // group.add(cube);

      // Position in circle
      const portfolioPieces = artworksRef.current;
      portfolioPieces.forEach((piece, i) => {

        const angle = (i / portfolioPieces.length) * Math.PI * 2;
        let position = piece.root.position;
        position.x = -radius * Math.sin(angle);
        // position.y = 0;
        position.z = radius * Math.cos(angle);

        //console.log('Setting target for mesh', i, 'to', position);


      });


      const offset = portfolioPieces[0].root.position.clone();

      portfolioPieces.forEach((piece, _) => {

        piece.root.position.copy(piece.root.position.clone().sub(offset));

      });


      // Recalculate circle positions
      // updatePositions();
      // }
    };
    window.addEventListener('click', onClick);

    // Animation loop
    const animate = () => {
      stats.update();
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

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      rendererRef.current?.domElement.removeEventListener('click', onClick);
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
      containerRef.current?.removeChild(stats.dom);
    };
  }, []);

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

  // --- Rotate clockwise ---
  const rotateClockwise = () => {
    const meshes = artworksRef.current.map(m => m.root!);
    if (meshes.length === 0) return;
    const positions = meshes.map(m => m.position.clone());
    meshes.forEach((mesh, i) => {
      mesh.userData.targetPosition =
        positions[(i - 1 + meshes.length) % meshes.length].clone();
    });
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div ref={containerRef} style={{ width: '80%', height: '100%' }} />
      <div style={{ padding: '10px' }}>
        <button onClick={rotateClockwise}>Rotate Clockwise</button>
      </div>
    </div>
  );
}

export default Scene3D;



