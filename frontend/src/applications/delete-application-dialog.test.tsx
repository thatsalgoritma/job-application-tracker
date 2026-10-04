import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeleteApplicationDialog } from './delete-application-dialog';

const application = { id: 'app-1', company: 'Acme', position: 'Backend Engineer' } as never;

describe('DeleteApplicationDialog', () => {
  it('names the application, warns about interviews, and calls delete only after confirmation', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<DeleteApplicationDialog application={application} isDeleting={false} error="" onCancel={vi.fn()} onConfirm={onConfirm} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Delete application?');
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText(/all of its interviews/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Delete application' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('supports Escape to cancel and exposes delete errors', () => {
    const onCancel = vi.fn();
    render(<DeleteApplicationDialog application={application} isDeleting={false} error="Network unavailable" onCancel={onCancel} onConfirm={vi.fn()} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable');
  });
});
