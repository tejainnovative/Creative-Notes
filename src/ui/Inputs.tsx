import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronRight, LoaderCircle, Search, SendHorizontal, X } from 'lucide-react';
import { IconButton } from './Button';
import { cx } from './cx';

export function SearchField({ value, onChange, label = 'Search meetings and notes' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const id = useId();
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
      <input
        id={id}
        type="search"
        value={value}
        placeholder={label}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')}
        className="h-11 w-full rounded-md border border-border-input bg-surface pr-11 pl-10 text-base placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <IconButton label="Clear search" size="sm" onClick={() => onChange('')} className="absolute top-1/2 right-1.5 -translate-y-1/2">
          <X aria-hidden className="size-4" />
        </IconButton>
      )}
    </div>
  );
}

interface ComposerProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  variant?: 'chat' | 'note';
  sending?: boolean;
  disabledReason?: string;
  placeholder?: string;
}

/** Chat: Enter sends, Shift+Enter is a new line. Note: Ctrl/Cmd+Enter saves. */
export function Composer({ label, value, onChange, onSubmit, variant = 'chat', sending, disabledReason, placeholder }: ComposerProps) {
  const id = useId();
  const hintId = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !sending && !disabledReason;

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const submit = variant === 'chat' ? e.key === 'Enter' && !e.shiftKey : e.key === 'Enter' && (e.ctrlKey || e.metaKey);
    if (submit) {
      e.preventDefault();
      if (canSend) onSubmit();
    }
  }

  return (
    <div>
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className={cx('flex items-end gap-2 rounded-lg border border-border-input bg-surface p-1.5 pl-3', variant === 'note' && 'flex-col items-stretch p-3')}>
        <textarea
          id={id}
          ref={ref}
          value={value}
          rows={variant === 'note' ? 8 : 1}
          placeholder={placeholder}
          aria-describedby={disabledReason ? hintId : undefined}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className={cx(
            'w-full resize-none rounded-sm bg-transparent text-base placeholder:text-muted',
            variant === 'chat' ? 'max-h-32 py-2 [field-sizing:content]' : 'min-h-40',
          )}
        />
        {variant === 'chat' && (
          <IconButton label="Send" disabled={!canSend} onClick={onSubmit} className={canSend ? 'bg-accent text-on-accent hover:bg-accent/90' : 'text-muted'}>
            {sending ? <LoaderCircle aria-hidden className="size-5 animate-spin" /> : <SendHorizontal aria-hidden className="size-5" />}
          </IconButton>
        )}
      </div>
      {disabledReason && <p id={hintId} className="mt-1 text-xs text-muted">{disabledReason}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-7 w-11 shrink-0 items-center rounded-pill border transition-colors duration-(--cn-motion-fast)',
        checked ? 'border-accent bg-accent' : 'border-border-input bg-surface-sunken',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'inline-block size-5 rounded-pill shadow-card transition-transform duration-(--cn-motion-fast)',
          checked ? 'translate-x-5 bg-on-accent' : 'translate-x-0.5 bg-surface',
        )}
      />
    </button>
  );
}

interface SettingsRowProps {
  label: string;
  description?: string;
  value?: ReactNode;
  control?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
}

/** A row in a settings group. With onClick it's a button with a chevron; with control it holds a Toggle. */
export function SettingsRow({ label, description, value, control, onClick, danger }: SettingsRowProps) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className={cx('block', danger && 'text-danger font-semibold')}>{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
      {value && <span className="shrink-0 text-sm text-muted">{value}</span>}
      {control}
      {onClick && !control && <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />}
    </>
  );
  const cls = 'flex min-h-13 w-full items-center gap-3 px-4 py-3 text-left';
  return (
    <li className="border-b border-border last:border-b-0">
      {onClick ? (
        <button type="button" onClick={onClick} className={cx(cls, 'hover:bg-surface-sunken')}>{body}</button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-4 text-xs font-semibold text-muted">{title}</h2>
      <ul className="overflow-hidden rounded-lg bg-surface shadow-card">{children}</ul>
    </section>
  );
}

export function SuggestionChip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 rounded-pill border border-border bg-surface px-4 py-2 text-left text-sm hover:bg-surface-sunken"
    >
      {children}
    </button>
  );
}
