import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ImageFocusViewer from './ImageFocusViewer';
import { DEFAULT_CANVAS } from '@/frontend/three/easelCanvas';
import type { PieceImage, PortfolioImage } from '@/types/PortfolioPiece';

// jsdom has no layout or 2D canvas.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

const image: PieceImage = {
  url: '/uploads/images/lantern.png',
  width: 3000,
  height: 4000,
  canvas: { ...DEFAULT_CANVAS, medium: 'oil' },
};
const renders: PortfolioImage[] = [
  { id: 'r1', url: '/uploads/renders/sketch.png', caption: 'Sketch' },
  { id: 'r2', url: '/uploads/renders/flats.png', caption: 'Flats' },
];

function renderViewer(props: Partial<Parameters<typeof ImageFocusViewer>[0]> = {}) {
  const handlers = { onClose: vi.fn(), onToggleFullscreen: vi.fn(), onCanvasChange: vi.fn() };
  render(<ImageFocusViewer title="Lantern Ridge" image={image} renders={[]} isFullscreen={false} {...handlers} {...props} />);
  return handlers;
}

describe('ImageFocusViewer', () => {
  it('shows the artwork flat with its size and medium', () => {
    renderViewer({ onCanvasChange: undefined });
    expect(screen.getByRole('heading', { name: 'Lantern Ridge' })).toBeInTheDocument();
    expect(screen.getByText('3000 × 4000 px · Oil')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1:1 pixels' })).toBeInTheDocument();
    // No process steps without renders, and only the owner changes the canvas.
    expect(screen.queryByRole('tab', { name: /process/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'White' })).not.toBeInTheDocument();
  });

  it('closes with Esc and the close button', () => {
    const { onClose } = renderViewer();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close (Esc)' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('compares the renders as process steps, ending on the final image', () => {
    renderViewer({ renders });
    fireEvent.click(screen.getByRole('tab', { name: 'Process (3)' }));

    expect(screen.getByRole('radio', { name: 'Sketch → Flats' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Flats → Final' })).toBeInTheDocument();
    const divider = screen.getByRole('slider', { name: 'Comparison divider' });
    fireEvent.keyDown(divider, { key: 'End' });
    expect(divider).toHaveAttribute('aria-valuenow', '100');
  });

  it('lets the owner change the canvas edges', () => {
    const { onCanvasChange } = renderViewer();
    fireEvent.click(screen.getByRole('radio', { name: 'White' }));
    expect(onCanvasChange).toHaveBeenCalledWith({ ...image.canvas, edge: 'white' });
  });
});
