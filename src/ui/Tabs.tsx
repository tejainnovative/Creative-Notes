import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

interface Props {
  label: string;
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  children: (id: string) => ReactNode;
  /** Take the remaining height of a flex column; the panel scrolls on its own. */
  fill?: boolean;
}

/** WAI-ARIA tabs with a roving tabindex. Arrow keys, Home and End move between tabs. */
export function SegmentedTabs({ label, tabs, value, onChange, children, fill }: Props) {
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const enabled = tabs.filter((t) => !t.disabled);

  function onKeyDown(e: KeyboardEvent) {
    const i = enabled.findIndex((t) => t.id === value);
    const next =
      e.key === 'ArrowRight' ? enabled[(i + 1) % enabled.length]
      : e.key === 'ArrowLeft' ? enabled[(i - 1 + enabled.length) % enabled.length]
      : e.key === 'Home' ? enabled[0]
      : e.key === 'End' ? enabled[enabled.length - 1]
      : undefined;
    if (!next) return;
    e.preventDefault();
    onChange(next.id);
    refs.current[next.id]?.focus();
  }

  return (
    <div className={cx(fill && 'flex min-h-0 flex-1 flex-col')}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex overflow-x-auto border-b border-border [scrollbar-width:none]"
      >
        {tabs.map((t) => {
          const selected = t.id === value;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              aria-disabled={t.disabled || undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => !t.disabled && onChange(t.id)}
              className={cx(
                'relative flex h-11 min-w-fit flex-1 items-center justify-center gap-1.5 px-2 text-sm font-semibold whitespace-nowrap md:flex-none md:px-4',
                selected ? 'text-fg' : 'text-muted hover:text-fg',
                t.disabled && 'opacity-50 cursor-not-allowed hover:text-muted',
              )}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="tabular rounded-pill bg-accent-soft px-1.5 text-xs text-accent">{t.count}</span>
              )}
              {selected && <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-pill bg-accent" />}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel-${value}`}
        aria-labelledby={`${base}-tab-${value}`}
        tabIndex={0}
        className={cx(fill && 'min-h-0 flex-1 overflow-y-auto')}
      >
        {children(value)}
      </div>
    </div>
  );
}
