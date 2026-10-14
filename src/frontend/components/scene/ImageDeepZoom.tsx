import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/frontend/hooks/useI18n';
import { resizedUrl } from '@/frontend/utils/images';

type ImageDeepZoomProps = {
  // The full-size original; a resized variant is shown while it loads.
  url: string;
  width: number;
  height: number;
};

// Furthest zoom: 8 screen pixels per image pixel.
const MAX_PIXEL_ZOOM = 8;
const MINIMAP_SIZE = 110;

type View = {
  // Screen (CSS) pixels per image pixel, and the image point at the center.
  scale: number;
  cx: number;
  cy: number;
  fitScale: number;
  width: number;
  height: number;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = src;
  });
}

// A flat view of a 2D artwork that zooms in to single pixels: drag to pan,
// scroll or pinch to zoom, with a minimap once zoomed in.
export default function ImageDeepZoom({ url, width, height }: ImageDeepZoomProps) {
  const { t } = useI18n();
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const viewRef = useRef<View>({ scale: 1, cx: width / 2, cy: height / 2, fitScale: 1, width: 0, height: 0 });
  const [zoomPercent, setZoomPercent] = useState<number | null>(null);
  const [zoomedIn, setZoomedIn] = useState(false);
  const [status, setStatus] = useState<'loading' | 'preview' | 'full' | 'failed'>('loading');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // Everything below reads the view from the ref, so it's safe to call from
  // the listeners bound once.
  const drawRef = useRef(() => {});
  useEffect(() => {
    drawRef.current = redraw;
  });
  const redraw = () => {
    const canvas = canvasRef.current;
    const view = viewRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !view.width) return;

    view.scale = Math.min(Math.max(view.scale, view.fitScale * 0.8), MAX_PIXEL_ZOOM / dpr);
    view.cx = Math.min(Math.max(view.cx, 0), width);
    view.cy = Math.min(Math.max(view.cy, 0), height);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    const image = imageRef.current;
    if (image) {
      // Past 1:1 the pixels stay sharp squares, so the brushwork shows.
      ctx.imageSmoothingEnabled = view.scale * dpr < 1.5;
      ctx.save();
      ctx.translate(view.width / 2, view.height / 2);
      ctx.scale(view.scale, view.scale);
      ctx.translate(-view.cx, -view.cy);
      ctx.drawImage(image, 0, 0, width, height);
      ctx.restore();
    }

    setZoomPercent(Math.round(view.scale * dpr * 100));
    const isZoomedIn = view.scale > view.fitScale * 1.05;
    setZoomedIn(isZoomedIn);

    const minimap = minimapRef.current;
    const mini = minimap?.getContext('2d');
    if (minimap && mini && image && isZoomedIn) {
      const k = MINIMAP_SIZE / Math.max(width, height);
      const w = Math.round(width * k);
      const h = Math.round(height * k);
      if (minimap.width !== w * dpr) {
        minimap.width = w * dpr;
        minimap.height = h * dpr;
        minimap.style.width = `${w}px`;
        minimap.style.height = `${h}px`;
      }
      mini.setTransform(dpr, 0, 0, dpr, 0, 0);
      mini.drawImage(image, 0, 0, w, h);
      const x = (view.cx - view.width / 2 / view.scale) * k;
      const y = (view.cy - view.height / 2 / view.scale) * k;
      mini.lineWidth = 2;
      mini.strokeStyle = '#ffffff';
      mini.strokeRect(x, y, (view.width / view.scale) * k, (view.height / view.scale) * k);
      mini.lineWidth = 1;
      mini.strokeStyle = '#2563eb';
      mini.strokeRect(x, y, (view.width / view.scale) * k, (view.height / view.scale) * k);
    }
  };
  const draw = () => redraw();

  const zoomAt = (factor: number, sx: number, sy: number) => {
    const view = viewRef.current;
    const ix = view.cx + (sx - view.width / 2) / view.scale;
    const iy = view.cy + (sy - view.height / 2) / view.scale;
    view.scale = Math.min(Math.max(view.scale * factor, view.fitScale * 0.8), MAX_PIXEL_ZOOM / dpr);
    view.cx = ix - (sx - view.width / 2) / view.scale;
    view.cy = iy - (sy - view.height / 2) / view.scale;
    draw();
  };
  const zoomAtCenter = (factor: number) => zoomAt(factor, viewRef.current.width / 2, viewRef.current.height / 2);

  const fit = () => {
    const view = viewRef.current;
    view.scale = view.fitScale;
    view.cx = width / 2;
    view.cy = height / 2;
    draw();
  };

  const actualPixels = () => {
    viewRef.current.scale = 1 / dpr;
    draw();
  };

  // The resized variant first (quick), then the original.
  useEffect(() => {
    let cancelled = false;
    let fullLoaded = false;
    let shown = false;
    let pending = 2;
    const settle = () => {
      pending -= 1;
      if (!cancelled && pending === 0 && !shown) setStatus('failed');
    };
    loadImage(resizedUrl(url, 1920)).then(image => {
      if (cancelled || fullLoaded) return;
      shown = true;
      imageRef.current = image;
      setStatus('preview');
      drawRef.current();
    }).catch(() => {}).finally(settle);
    loadImage(url).then(image => {
      if (cancelled) return;
      fullLoaded = shown = true;
      imageRef.current = image;
      setStatus('full');
      drawRef.current();
    }).catch(() => {
      // The preview stays up if it arrived; there's nothing more to wait for.
      if (!cancelled && shown) setStatus('full');
    }).finally(settle);
    return () => { cancelled = true; };
  }, [url]);

  // Sized to the box; stays fitted until the visitor zooms.
  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    const observer = new ResizeObserver(() => {
      const view = viewRef.current;
      const wasFitted = !view.width || Math.abs(view.scale - view.fitScale) < 1e-6;
      view.width = box.clientWidth;
      view.height = box.clientHeight;
      canvas.width = view.width * dpr;
      canvas.height = view.height * dpr;
      view.fitScale = Math.min(view.width / width, view.height / height) * 0.94;
      if (wasFitted) {
        view.scale = view.fitScale;
        view.cx = width / 2;
        view.cy = height / 2;
      }
      drawRef.current();
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [width, height, dpr]);

  // Wheel zoom, drag to pan, pinch to zoom. The wheel listener is native and
  // stops the event, so the 3D scene behind doesn't zoom too.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDistance = 0;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
    };
    const onPointerDown = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    };
    const onPointerMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        const view = viewRef.current;
        view.cx -= (event.clientX - previous.x) / view.scale;
        view.cy -= (event.clientY - previous.y) / view.scale;
        drawRef.current();
        return;
      }
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = canvas.getBoundingClientRect();
      if (pinchDistance) zoomAt(distance / pinchDistance, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      pinchDistance = distance;
    };
    const onPointerUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      pinchDistance = 0;
    };
    const onDoubleClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      zoomAt(2, event.clientX - rect.left, event.clientY - rect.top);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('dblclick', onDoubleClick);
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('dblclick', onDoubleClick);
    };
    // zoomAt only goes through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const view = viewRef.current;
    const step = 80 / view.scale;
    const actions: Record<string, () => void> = {
      '+': () => zoomAtCenter(1.5),
      '=': () => zoomAtCenter(1.5),
      '-': () => zoomAtCenter(1 / 1.5),
      '0': fit,
      ArrowLeft: () => { view.cx -= step; draw(); },
      ArrowRight: () => { view.cx += step; draw(); },
      ArrowUp: () => { view.cy -= step; draw(); },
      ArrowDown: () => { view.cy += step; draw(); },
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  return (
    <div className="deep-zoom">
      <div ref={boxRef} className="deep-zoom-stage" tabIndex={0} onKeyDown={onKeyDown} aria-label={t('imageViewer.hint')}>
        <canvas ref={canvasRef} className="deep-zoom-canvas" />
        <canvas ref={minimapRef} className="deep-zoom-minimap" hidden={!zoomedIn} aria-hidden="true" />
        {status === 'loading' && <p className="deep-zoom-status">{t('common.loading')}</p>}
        {status === 'failed' && <p className="deep-zoom-status">{t('imageViewer.loadFailed')}</p>}
      </div>
      <div className="deep-zoom-toolbar">
        <button type="button" className="viewer-btn" onClick={fit}>{t('imageViewer.fit')}</button>
        <button type="button" className="viewer-btn" onClick={actualPixels}>{t('imageViewer.actualPixels')}</button>
        <button type="button" className="viewer-btn icon" onClick={() => zoomAtCenter(1 / 1.5)} aria-label={t('imageViewer.zoomOut')}>−</button>
        <button type="button" className="viewer-btn icon" onClick={() => zoomAtCenter(1.5)} aria-label={t('imageViewer.zoomIn')}>+</button>
        <span className="deep-zoom-level">{zoomPercent === null ? '' : `${zoomPercent}%`}</span>
        {status === 'preview' && <span className="deep-zoom-note">{t('imageViewer.loadingFull')}</span>}
      </div>
    </div>
  );
}
