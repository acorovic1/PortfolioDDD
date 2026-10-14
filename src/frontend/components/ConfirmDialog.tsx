import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '@/frontend/svg/Icons';
import { useI18n } from '@/frontend/hooks/useI18n';
import '@/frontend/css/Community.css';
import '@/frontend/css/ConfirmDialog.css';

type ConfirmDialogProps = {
  title: string;
  // What's about to happen (and anything worth seeing first).
  children: ReactNode;
  confirmLabel: string;
  // Shown on the confirm button while onConfirm runs.
  busyLabel?: string;
  // A destructive action: the confirm button is red.
  danger?: boolean;
  // May be async: the card stays open (buttons disabled) until it settles,
  // closes when it succeeds, and shows the error when it throws.
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  // E.g. while a required field in the card is empty.
  confirmDisabled?: boolean;
  // 'field': the first text field in the card gets the focus (and Enter in
  // it confirms), for cards that ask for a value.
  initialFocus?: 'cancel' | 'field';
};

// A card asking to confirm an action (or for a value), in place of the
// browser's confirm() and prompt(). Cancel has the focus by default, so
// Enter right after opening doesn't confirm.
export default function ConfirmDialog({
  title, children, confirmLabel, busyLabel, danger = false, onConfirm, onClose,
  confirmDisabled = false, initialFocus = 'cancel',
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const bodyId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const field = initialFocus === 'field'
      ? bodyRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
      : null;
    if (field) {
      field.focus();
      field.select();
    } else {
      cancelRef.current?.focus();
    }
    // Once, when the card opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc cancels (but not halfway through).
  const busyRef = useRef(busy);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    // React events bubble out of the portal to the opener's components - a
    // form the opener sits in mustn't see this submit.
    event.stopPropagation();
    if (busy || confirmDisabled) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError((err as Error).message || t('confirm.failed'));
      setBusy(false);
    }
  };

  const close = () => {
    if (!busy) onClose();
  };

  // On <body>: never inside the opener's form, menu or clipped container.
  return createPortal(
    <div className="modal-overlay" onClick={close}>
      <div
        className="modal-card confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h3 id={titleId}>{title}</h3>
          <button className="modal-close" onClick={close} disabled={busy} aria-label={t('common.close')}><CloseIcon /></button>
        </header>
        <form className="confirm-form" onSubmit={(e) => { void confirm(e); }}>
          <div className="modal-body" id={bodyId} ref={bodyRef}>
            {children}
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
          <div className="modal-footer">
            <button ref={cancelRef} type="button" className="btn" onClick={close} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className={`btn ${danger ? 'danger-solid' : 'primary'}`}
              disabled={busy || confirmDisabled}
              aria-busy={busy}
            >
              {busy && <span className="confirm-spinner" aria-hidden="true" />}
              {busy && busyLabel ? busyLabel : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
