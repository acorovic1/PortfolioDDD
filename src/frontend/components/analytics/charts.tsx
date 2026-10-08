import { useEffect, useRef, useState } from 'react';
import { compactNumber } from '@/frontend/utils/format';

// Small, dependency-free SVG charts for the analytics page. Single series
// each (the card title names it, so no legend), hover + keyboard tooltips,
// and the numbers are always also available as a table.

function formatDay(date: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}

// A clean, even axis maximum at or above the data's maximum, so the
// midpoint tick is a whole number too (these are all counts).
function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 4, 6, 8, 10].find(s => s * magnitude >= value)!;
  return step * magnitude;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

type Point = { date: string; value: number };

const HEIGHT = 170;
const PAD = { top: 14, right: 44, bottom: 26, left: 36 };

export function LineChart({ points, label }: { points: Point[]; label: string }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const max = niceMax(Math.max(0, ...points.map(p => p.value)));
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = points.length > 0
    ? `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`
    : '';
  const ticks = [0, max / 2, max];
  const xLabels = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, i) => i);
  const last = points.length - 1;

  const nearest = (clientX: number, rect: DOMRect) => {
    const ratio = (clientX - rect.left - PAD.left) / innerW;
    return Math.min(last, Math.max(0, Math.round(ratio * last)));
  };

  const shown = active ?? null;
  const tooltipLeft = shown !== null ? Math.min(Math.max(x(shown) - 60, 0), width - 120) : 0;

  return (
    <div className="viz-chart" ref={wrapRef}>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`${label} per day`}
        tabIndex={0}
        onPointerMove={(e) => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(last)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setActive(i => Math.max(0, (i ?? last) - 1));
          if (e.key === 'ArrowRight') setActive(i => Math.min(last, (i ?? last) + 1));
        }}
      >
        {ticks.map(t => (
          <g key={t}>
            <line className="viz-grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="viz-tick" x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">{compactNumber(t)}</text>
          </g>
        ))}
        {xLabels.map(i => (
          <text key={i} className="viz-tick" x={x(i)} y={HEIGHT - 6} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}>
            {formatDay(points[i].date)}
          </text>
        ))}
        <path className="viz-area" d={area} />
        <path className="viz-line" d={line} />
        {last >= 0 && (
          <>
            <circle className="viz-dot" cx={x(last)} cy={y(points[last].value)} r={4} />
            <text className="viz-end-label" x={x(last) + 8} y={y(points[last].value)} dy="0.32em">
              {compactNumber(points[last].value)}
            </text>
          </>
        )}
        {shown !== null && (
          <g pointerEvents="none">
            <line className="viz-crosshair" x1={x(shown)} x2={x(shown)} y1={PAD.top} y2={PAD.top + innerH} />
            <circle className="viz-dot" cx={x(shown)} cy={y(points[shown].value)} r={4} />
          </g>
        )}
      </svg>
      {shown !== null && (
        <div className="viz-tooltip" style={{ left: tooltipLeft }} role="status">
          <span className="viz-tooltip-key" />
          <strong>{points[shown].value.toLocaleString()}</strong>
          <span>{label.toLowerCase()} · {formatDay(points[shown].date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        </div>
      )}
    </div>
  );
}

export function BarList({ rows, label }: { rows: { label: string; value: number }[]; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...rows.map(r => r.value));
  const total = rows.reduce((sum, r) => sum + r.value, 0);

  return (
    <ul className="viz-bars" aria-label={label}>
      {rows.map((row, i) => (
        <li
          key={row.label}
          className={active === i ? 'active' : ''}
          tabIndex={0}
          onPointerEnter={() => setActive(i)}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(i)}
          onBlur={() => setActive(null)}
        >
          <span className="viz-bar-label">{row.label}</span>
          <span className="viz-bar-track">
            <span className="viz-bar" style={{ width: `${Math.max(1, (row.value / max) * 100)}%` }} />
            <span className="viz-bar-value">{row.value.toLocaleString()}</span>
          </span>
          {active === i && (
            <span className="viz-tooltip inline" role="status">
              <strong>{total ? Math.round((row.value / total) * 100) : 0}%</strong>
              <span>of views came from {row.label.toLowerCase()}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
