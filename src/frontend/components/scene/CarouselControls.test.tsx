import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CarouselControls from './CarouselControls';

function renderControls(canInspect = true) {
  const handlers = {
    onRotateCounterClockwise: vi.fn(),
    onRotateClockwise: vi.fn(),
    onCenter: vi.fn(),
    onInspect: vi.fn(),
  };
  render(<CarouselControls {...handlers} canInspect={canInspect} />);
  return handlers;
}

describe('CarouselControls', () => {
  it('wires each button to its handler', () => {
    const handlers = renderControls();

    fireEvent.click(screen.getByTitle('Rotate carousel counter-clockwise'));
    fireEvent.click(screen.getByTitle('Rotate carousel clockwise'));
    fireEvent.click(screen.getByTitle('Center camera on active artwork'));
    fireEvent.click(screen.getByRole('button', { name: /inspect/i }));

    expect(handlers.onRotateCounterClockwise).toHaveBeenCalledOnce();
    expect(handlers.onRotateClockwise).toHaveBeenCalledOnce();
    expect(handlers.onCenter).toHaveBeenCalledOnce();
    expect(handlers.onInspect).toHaveBeenCalledOnce();
  });

  it('disables Inspect when there is nothing to inspect', () => {
    const handlers = renderControls(false);
    const inspect = screen.getByRole('button', { name: /inspect/i });

    expect(inspect).toBeDisabled();
    fireEvent.click(inspect);
    expect(handlers.onInspect).not.toHaveBeenCalled();
  });
});
