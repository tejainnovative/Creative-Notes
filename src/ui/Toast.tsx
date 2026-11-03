import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, OctagonAlert, X } from 'lucide-react';
import { IconButton } from './Button';
import { cx } from './cx';

type Tone = 'info' | 'success' | 'error';

interface ToastInput {
  tone?: Tone;
  text: string;
  action?: { label: string; onClick: () => void };
}
interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const icons = { info: Info, success: CheckCircle2, error: OctagonAlert };
const iconTone = { info: 'text-accent', success: 'text-success', error: 'text-danger' };

/** At most two toasts. Info and success close after 5 s (paused while hovered or focused); errors stay. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback((t: ToastInput) => {
    setItems((all) => [...all, { ...t, id: nextId.current++ }].slice(-2));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <ol
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 top-[calc(var(--cn-topbar)+env(safe-area-inset-top))] z-50 flex flex-col items-center gap-2 px-4 md:top-auto md:right-6 md:bottom-6 md:left-auto md:items-end"
      >
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </ol>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const tone = item.tone ?? 'info';
  const [paused, setPaused] = useState(false);
  const Icon = icons[tone];

  useEffect(() => {
    if (tone === 'error' || paused) return;
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [tone, paused, onDismiss]);

  // The live-region role sits on an inner element: a role on the <li> itself would hide it from the list.
  return (
    <li className="pointer-events-auto w-full max-w-sm">
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface py-2 pr-2 pl-4 text-sm shadow-pop"
    >
      <Icon aria-hidden className={cx('size-5 shrink-0', iconTone[tone])} />
      <span className="min-w-0 flex-1">{item.text}</span>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            onDismiss();
          }}
          className="h-9 rounded-md px-2 font-semibold text-accent hover:bg-accent-soft"
        >
          {item.action.label}
        </button>
      )}
      <IconButton label="Dismiss" size="sm" onClick={onDismiss}>
        <X aria-hidden className="size-4" />
      </IconButton>
    </div>
    </li>
  );
}
