import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  onCancelRef.current = onCancel;
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) onCancelRef.current();
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') || []);
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[250] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}>
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" className="w-full max-w-md rounded-3xl border border-theme-border bg-theme-bg p-6 text-theme-text shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div className={`rounded-2xl p-3 ${danger ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
            <AlertTriangle size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="text-lg font-bold">{title}</h2>
            <p id="confirm-message" className="mt-1 text-sm leading-relaxed text-theme-muted">{message}</p>
          </div>
          <button type="button" aria-label={cancelLabel} disabled={busy} onClick={onCancel} className="rounded-xl p-2 text-theme-muted hover:bg-theme-glass disabled:opacity-50">
            <X size={18} />
          </button>
        </div>
        <div className="flex justify-end gap-3">
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel} className="rounded-xl border border-theme-border px-4 py-2 text-sm font-semibold hover:bg-theme-glass disabled:opacity-50">
            {cancelLabel}
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} className={`rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
