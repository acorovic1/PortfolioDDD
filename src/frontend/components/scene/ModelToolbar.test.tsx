import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ModelToolbar from './ModelToolbar';

function renderToolbar(rotating = false, disabled = false) {
  const handlers = { onToggleRotate: vi.fn(), onResetRotation: vi.fn() };
  render(<ModelToolbar {...handlers} rotating={rotating} disabled={disabled} />);
  return handlers;
}

describe('ModelToolbar', () => {
  it('toggles the rotate gizmo, offering a reset only while it is on', () => {
    const handlers = renderToolbar(false);
    expect(screen.queryByRole('button', { name: /reset/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /rotate model/i }));
    expect(handlers.onToggleRotate).toHaveBeenCalledOnce();
  });

  it('resets the model rotation', () => {
    const handlers = renderToolbar(true);
    expect(screen.getByRole('button', { name: /rotate model/i })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(handlers.onResetRotation).toHaveBeenCalledOnce();
  });

  it('is disabled when there is no model', () => {
    const handlers = renderToolbar(false, true);
    const toggle = screen.getByRole('button', { name: /rotate model/i });
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(handlers.onToggleRotate).not.toHaveBeenCalled();
  });
});
