import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RenderGallery from './RenderGallery';
import type { PortfolioImage } from '@/types/PortfolioPiece';

const renders: PortfolioImage[] = [
  { id: 'r1', url: 'http://example.com/r1.png', caption: 'Front view' },
  { id: 'r2', url: 'http://example.com/r2.png', caption: 'Side view' },
];

describe('RenderGallery', () => {
  it('renders each image with its caption', () => {
    render(<RenderGallery renders={renders} editable={false} onAdd={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByAltText('Front view')).toBeInTheDocument();
    expect(screen.getByAltText('Side view')).toBeInTheDocument();
    expect(screen.getByText('Front view')).toBeInTheDocument();
  });

  it('hides the add button and delete controls when not editable', () => {
    render(<RenderGallery renders={renders} editable={false} onAdd={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.queryByText('Add Render or Video')).not.toBeInTheDocument();
  });

  it('calls onAdd when the add-render button is clicked', () => {
    const onAdd = vi.fn();
    render(<RenderGallery renders={renders} editable={true} onAdd={onAdd} onDelete={vi.fn()} />);

    fireEvent.click(screen.getByText('Add Render or Video'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('calls onDelete with the render id, without opening the lightbox', () => {
    const onDelete = vi.fn();
    const { container } = render(
      <RenderGallery renders={renders} editable={true} onAdd={vi.fn()} onDelete={onDelete} />
    );

    const deleteButtons = container.querySelectorAll('.delete-render-btn');
    expect(deleteButtons).toHaveLength(2);

    fireEvent.click(deleteButtons[0]);
    expect(onDelete).toHaveBeenCalledWith('r1');
    // The click shouldn't have bubbled up to open the lightbox.
    expect(screen.queryByText('Front view', { selector: '.lightbox-caption' })).not.toBeInTheDocument();
  });
});
