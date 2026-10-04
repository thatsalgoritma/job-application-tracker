import { useEffect, useRef, useState } from 'react';
import type { Application } from './application-types';

interface DeleteApplicationDialogProps {
  application: Application;
  isDeleting: boolean;
  error: string;
  onCancel(): void;
  onConfirm(): Promise<void>;
}

export function DeleteApplicationDialog({
  application,
  isDeleting,
  error,
  onCancel,
  onConfirm,
}: DeleteApplicationDialogProps) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    cancelButton.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isDeleting && !isSubmitting) onCancel();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isDeleting, isSubmitting, onCancel]);

  async function confirm() {
    setIsSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  }

  const busy = isDeleting || isSubmitting;
  return (
    <div className="dialog-backdrop">
      <section className="application-dialog delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-application-title" aria-describedby="delete-application-warning">
        <header className="dialog-heading">
          <div>
            <p className="eyebrow">Permanent action</p>
            <h2 id="delete-application-title">Delete application?</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close dialog" onClick={onCancel} disabled={busy}>×</button>
        </header>
        <p className="delete-summary"><strong>{application.company}</strong> — {application.position}</p>
        <p id="delete-application-warning" className="delete-warning">This will permanently delete this application and all of its interviews. This action cannot be undone.</p>
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="dialog-actions">
          <button ref={cancelButton} className="secondary-action" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="danger-action" type="button" onClick={() => void confirm()} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete application'}
          </button>
        </div>
      </section>
    </div>
  );
}
