import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}

/**
 * Native <dialog> with showModal(): focus moves inside, Esc closes, the page
 * behind is inert, and focus returns to the opener on close.
 * Below md it is a bottom sheet; from md up a centred dialog.
 */
export function Dialog({ open, onClose, title, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      opener.current = document.activeElement;
      el.showModal();
    } else if (!open && el.open) {
      el.close();
      if (opener.current instanceof HTMLElement) opener.current.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none rounded-t-xl bg-surface p-0 text-fg shadow-pop backdrop:bg-fg/40 md:m-auto md:max-w-120 md:rounded-xl"
    >
      <div className="p-5 pb-safe md:pb-5">
        <div aria-hidden className="mx-auto -mt-2 mb-3 h-1 w-10 rounded-pill bg-border md:hidden" />
        <h2 id={titleId} className="text-lg">{title}</h2>
        <div className="mt-2 text-sm text-muted">{children}</div>
        {actions && <div className="mt-5 flex flex-col-reverse gap-2 md:flex-row md:justify-end">{actions}</div>}
      </div>
    </dialog>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

/** Cancel is first in the DOM, so it gets focus first; the destructive button is last. */
export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel, destructive = true }: ConfirmProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      actions={
        <>
          <Button variant="secondary" onClick={onCancel} autoFocus>Cancel</Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      {body}
    </Dialog>
  );
}
