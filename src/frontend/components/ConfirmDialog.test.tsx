import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ConfirmDialog from './ConfirmDialog';
import DeleteArtworkDialog from './DeleteArtworkDialog';
import AddRenderDialog from './AddRenderDialog';
import * as THREE from 'three';
import type { PortfolioPiece } from '@/types/PortfolioPiece';

function renderDialog(onConfirm: () => void | Promise<void>, onClose = vi.fn()) {
  render(
    <ConfirmDialog title="Delete this artwork?" confirmLabel="Delete artwork" busyLabel="Deleting..." danger onConfirm={onConfirm} onClose={onClose}>
      <p>It is gone for good.</p>
    </ConfirmDialog>
  );
  return { onClose };
}

describe('ConfirmDialog', () => {
  it('shows a card with Cancel focused, so Enter does not confirm by accident', () => {
    renderDialog(vi.fn());
    expect(screen.getByRole('alertdialog', { name: 'Delete this artwork?' })).toBeInTheDocument();
    expect(screen.getByText('It is gone for good.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('closes on Cancel, Esc and a click outside, without confirming', () => {
    const onConfirm = vi.fn();
    const { onClose } = renderDialog(onConfirm);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(document.querySelector('.modal-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('waits for the action, then closes', async () => {
    let finish!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const { onClose } = renderDialog(onConfirm);

    fireEvent.click(screen.getByRole('button', { name: 'Delete artwork' }));
    // Busy: can't be closed or pressed twice meanwhile.
    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => { finish(); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open with the error when the action fails, ready to retry', async () => {
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error('Too many requests, please try again later'));
    const { onClose } = renderDialog(onConfirm);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete artwork' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('Too many requests, please try again later');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete artwork' })).toBeEnabled();
  });
});

describe('ConfirmDialog asking for a value', () => {
  it('focuses the field, and Enter in it confirms', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog title="Suspend @someone?" confirmLabel="Suspend" initialFocus="field" onConfirm={onConfirm} onClose={vi.fn()}>
        <input aria-label="Reason" defaultValue="Spam" />
      </ConfirmDialog>
    );
    const field = screen.getByRole('textbox', { name: 'Reason' });
    expect(field).toHaveFocus();

    await act(async () => { fireEvent.submit(field.closest('form')!); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cannot be confirmed while disabled', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog title="Suspend?" confirmLabel="Suspend" confirmDisabled onConfirm={onConfirm} onClose={vi.fn()}><input aria-label="Reason" /></ConfirmDialog>);

    expect(screen.getByRole('button', { name: 'Suspend' })).toBeDisabled();
    await act(async () => { fireEvent.submit(screen.getByRole('textbox').closest('form')!); });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("doesn't submit a form it was opened from", async () => {
    const outerSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={outerSubmit}>
        <ConfirmDialog title="Delete your account?" confirmLabel="Delete my account" onConfirm={vi.fn()} onClose={vi.fn()}>
          <p>Gone for good.</p>
        </ConfirmDialog>
      </form>
    );

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete my account' })); });
    expect(outerSubmit).not.toHaveBeenCalled();
  });
});

describe('AddRenderDialog', () => {
  it('suggests a caption from the file name and uploads with the one typed', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    const onAdd = vi.fn();
    const onClose = vi.fn();
    render(<AddRenderDialog file={new File(['x'], 'turntable_final-v2.png', { type: 'image/png' })} onAdd={onAdd} onClose={onClose} />);

    const caption = screen.getByRole('textbox', { name: 'Caption' });
    expect(caption).toHaveValue('Turntable final v2');
    expect(caption).toHaveFocus();
    fireEvent.change(caption, { target: { value: 'Clay pass' } });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add render' })); });
    expect(onAdd).toHaveBeenCalledWith('Clay pass');
    expect(onClose).toHaveBeenCalled();
  });

  it('titles a video render as one, with a playing preview', () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    const { baseElement } = render(<AddRenderDialog file={new File(['x'], 'spin.mp4', { type: 'video/mp4' })} onAdd={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole('alertdialog', { name: 'Add a video render' })).toBeInTheDocument();
    expect(baseElement.querySelector('video.confirm-media-preview')).not.toBeNull();
  });
});

describe('DeleteArtworkDialog', () => {
  it('names the artwork and what goes with it', () => {
    const artwork = {
      id: 'a1',
      root: new THREE.Group(),
      bounds: new THREE.Box3(),
      infoData: { title: 'Lantern Ridge', description: '', tools: [], year: '', category: '', tags: [] },
      renders: [{ id: 'r1', url: '/uploads/renders/a.png', caption: '' }, { id: 'r2', url: '/uploads/renders/b.png', caption: '' }],
      likeCount: 1,
      animations: [],
    } as PortfolioPiece;
    render(<DeleteArtworkDialog artwork={artwork} commentCount={3} onDelete={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('Lantern Ridge')).toBeInTheDocument();
    expect(screen.getByText('2 renders · 1 like · 3 comments')).toBeInTheDocument();
  });
});
