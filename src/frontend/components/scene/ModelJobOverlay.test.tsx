import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ModelJobOverlay from './ModelJobOverlay';

const failed = [
  { id: 'f1', title: 'Robot', error: 'Unsupported format' },
  { id: 'f2', title: '', error: 'Corrupt file' },
];

describe('ModelJobOverlay', () => {
  it('renders nothing when there is no job and nothing failed', () => {
    const { container } = render(
      <ModelJobOverlay notice={null} failedUploads={[]} onDismiss={vi.fn()} onRemoveFailed={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows upload progress', () => {
    const { container } = render(
      <ModelJobOverlay
        notice={{ kind: 'uploading', title: 'Robot', progress: 42 }}
        failedUploads={[]}
        onDismiss={vi.fn()}
        onRemoveFailed={vi.fn()}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Uploading “Robot”… 42%');
    expect(container.querySelector('.upload-progress-fill')).toHaveStyle({ width: '42%' });
  });

  it('shows server-side processing', () => {
    render(
      <ModelJobOverlay notice={{ kind: 'processing', title: 'Robot' }} failedUploads={[]} onDismiss={vi.fn()} onRemoveFailed={vi.fn()} />
    );
    expect(screen.getByText('Processing “Robot”…')).toBeInTheDocument();
    expect(screen.getByText('Converting and optimizing the model on the server')).toBeInTheDocument();
  });

  it('shows an error that can be dismissed', () => {
    const onDismiss = vi.fn();
    render(
      <ModelJobOverlay
        notice={{ kind: 'error', title: 'Robot', message: 'Too many polygons' }}
        failedUploads={[]}
        onDismiss={onDismiss}
        onRemoveFailed={vi.fn()}
      />
    );
    expect(screen.getByText('Too many polygons')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('lists failed uploads with a way to remove each', () => {
    const onRemoveFailed = vi.fn();
    render(<ModelJobOverlay notice={null} failedUploads={failed} onDismiss={vi.fn()} onRemoveFailed={onRemoveFailed} />);

    expect(screen.getByRole('alert')).toHaveTextContent('2 uploads failed to process');
    expect(screen.getByText('Untitled')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Remove')[1]);
    expect(onRemoveFailed).toHaveBeenCalledWith('f2');
  });

  it('puts a running job ahead of the failed-uploads list', () => {
    render(
      <ModelJobOverlay
        notice={{ kind: 'processing', title: 'Robot' }}
        failedUploads={failed}
        onDismiss={vi.fn()}
        onRemoveFailed={vi.fn()}
      />
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
