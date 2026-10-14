import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import UploadDialog from './UploadDialog';

describe('UploadDialog', () => {
  it('asks a model only for its title and publishing choice', () => {
    const onSubmit = vi.fn();
    render(<UploadDialog fileName="robot_v2.glb" onSubmit={onSubmit} onCancel={() => {}} />);

    expect(screen.getByRole('dialog', { name: 'Upload a model' })).toBeInTheDocument();
    expect(screen.queryByText('Canvas edges')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(onSubmit).toHaveBeenCalledWith({ title: 'Robot v2', when: 'now', publishAt: undefined, canvas: undefined });
  });

  it('asks a 2D artwork how its canvas looks', () => {
    const onSubmit = vi.fn();
    render(<UploadDialog fileName="lantern-ridge.png" kind="image" previewUrl="blob:preview" onSubmit={onSubmit} onCancel={() => {}} />);

    expect(screen.getByRole('dialog', { name: 'Upload a 2D artwork' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Black' })).toHaveAttribute('aria-checked', 'true');
    const edges = within(screen.getByRole('radiogroup', { name: 'Canvas edges' }));
    expect(edges.getAllByRole('radio').map(r => r.textContent)).toEqual(['Black', 'White']);
    // The size comes from the image's resolution, so it isn't asked.
    expect(screen.queryByLabelText(/width|height/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'White' }));
    fireEvent.change(screen.getByLabelText('Medium'), { target: { value: 'watercolour' } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Lantern ridge',
      canvas: { edge: 'white', medium: 'watercolour' },
    }));
  });

  it('defaults to black edges and no medium', () => {
    const onSubmit = vi.fn();
    render(<UploadDialog fileName="study.jpg" kind="image" onSubmit={onSubmit} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(onSubmit.mock.calls[0][0].canvas).toEqual({ edge: 'black', medium: null });
  });
});
