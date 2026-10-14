import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/frontend/hooks/useI18n';
import { resizedUrl } from '@/frontend/utils/images';

export type ProcessStep = { label: string; url: string };

const SWEEP_MS = 1500;
const PAUSE_MS = 450;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));

// One stage of a piece next to the next one (sketch -> line art -> ... ->
// final), split by a divider the visitor drags; "play" sweeps through them
// all in order.
export default function ProcessSteps({ steps }: { steps: ProcessStep[] }) {
  const { t } = useI18n();
  const [pair, setPair] = useState(0);
  const [split, setSplit] = useState(50);
  const [playing, setPlaying] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const pairs = steps.slice(0, -1).map((step, i) => ({ from: step, to: steps[i + 1] }));
  const current = pairs[Math.min(pair, pairs.length - 1)];

  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    (async () => {
      const sweep = reducedMotion() ? 0 : SWEEP_MS;
      for (let i = 0; i < pairs.length && !cancelled; i++) {
        setPair(i);
        setSplit(100);
        await wait(PAUSE_MS);
        const start = performance.now();
        while (!cancelled) {
          const now = await nextFrame();
          const k = sweep ? Math.min(1, (now - start) / sweep) : 1;
          const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          setSplit(100 - 100 * eased);
          if (k >= 1) break;
        }
        await wait(PAUSE_MS);
      }
      if (!cancelled) setPlaying(false);
    })();
    return () => { cancelled = true; };
    // Restarts only when play is pressed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  if (!current) return null;

  const splitAt = (clientX: number) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return;
    setSplit(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowLeft: split - 5, ArrowRight: split + 5, Home: 0, End: 100 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    setPlaying(false);
    setSplit(Math.min(100, Math.max(0, moves[event.key])));
  };

  return (
    <div className="process-steps">
      <div
        ref={boxRef}
        className="process-compare"
        onPointerDown={(e) => {
          draggingRef.current = true;
          setPlaying(false);
          e.currentTarget.setPointerCapture(e.pointerId);
          splitAt(e.clientX);
        }}
        onPointerMove={(e) => { if (draggingRef.current) splitAt(e.clientX); }}
        onPointerUp={() => { draggingRef.current = false; }}
        onPointerCancel={() => { draggingRef.current = false; }}
      >
        <img className="process-image" src={resizedUrl(current.to.url, 1920)} alt={current.to.label} draggable={false} />
        <img
          className="process-image"
          src={resizedUrl(current.from.url, 1920)}
          alt={current.from.label}
          draggable={false}
          style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
        />
        <div
          className="process-handle"
          style={{ left: `${split}%` }}
          role="slider"
          tabIndex={0}
          aria-label={t('imageViewer.divider')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(split)}
          onKeyDown={onKeyDown}
        />
        <span className="process-tag left">{current.from.label}</span>
        <span className="process-tag right">{current.to.label}</span>
      </div>
      <div className="process-toolbar">
        <div className="segmented process-pairs" role="radiogroup">
          {pairs.map((p, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={i === pair}
              className={i === pair ? 'active' : ''}
              onClick={() => { setPlaying(false); setPair(i); setSplit(50); }}
            >
              {p.from.label} → {p.to.label}
            </button>
          ))}
        </div>
        {pairs.length > 0 && (
          <button type="button" className="viewer-btn" onClick={() => setPlaying(true)} disabled={playing}>
            {t('imageViewer.play')}
          </button>
        )}
      </div>
    </div>
  );
}
