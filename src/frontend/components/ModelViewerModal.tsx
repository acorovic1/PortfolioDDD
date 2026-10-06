import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CloseIcon } from '@/frontend/svg/Icons';
import { getGLTFLoader } from '@/frontend/three/gltfLoader';
import '@/frontend/css/ModelViewerModal.css';

export default function ModelViewerModal({
  modelUrl,
  title,
  onClose,
}: {
  modelUrl: string;
  title: string;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let frameId: number;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(10, 20, 10);
    scene.add(light);

    const resizeObserver = new ResizeObserver(() => {
      if (!container.clientWidth || !container.clientHeight) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
    resizeObserver.observe(container);

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    getGLTFLoader().load(
      modelUrl,
      (gltf) => {
        if (cancelled) return;

        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const center = bounds.getCenter(new THREE.Vector3());
        gltf.scene.position.sub(center);
        scene.add(gltf.scene);

        const sphere = bounds.getBoundingSphere(new THREE.Sphere());
        const distance = Math.max(sphere.radius * 2.5, 2);
        camera.position.set(distance, distance * 0.6, distance);
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
        controls.update();

        setIsLoading(false);
      },
      undefined,
      () => {
        if (!cancelled) {
          setError('Failed to load this 3D model');
          setIsLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach(m => m.dispose());
        else material?.dispose();
      });
    };
  }, [modelUrl]);

  return (
    <div className="model-viewer-overlay" onClick={onClose}>
      <div className="model-viewer-content" onClick={(e) => e.stopPropagation()}>
        <div className="model-viewer-header">
          <h3>{title}</h3>
          <button className="model-viewer-close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="model-viewer-canvas" ref={containerRef}>
          {isLoading && !error && (
            <div className="model-viewer-status">
              <div className="loading-spinner"></div>
              <p>Loading model...</p>
            </div>
          )}
          {error && (
            <div className="model-viewer-status">
              <p>{error}</p>
            </div>
          )}
        </div>
        <p className="model-viewer-hint">Drag to rotate · Scroll to zoom</p>
      </div>
    </div>
  );
}
