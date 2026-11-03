import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { UserRound } from 'lucide-react';
import { cx } from './cx';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-fg',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

export function Badge({ tone = 'neutral', icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={cx('inline-flex h-6 items-center gap-1 rounded-pill px-2 text-xs whitespace-nowrap', tones[tone])}>
      {icon}
      {children}
    </span>
  );
}

export function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'lg' }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <span
      aria-hidden
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-pill bg-accent-soft font-semibold text-accent',
        size === 'sm' ? 'size-8 text-xs' : 'size-14 text-lg',
      )}
    >
      {initials || <UserRound aria-hidden className={size === 'sm' ? 'size-4' : 'size-7'} />}
    </span>
  );
}

export function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg bg-surface p-4 shadow-card">
      <p>
        <span className={cx('tabular block text-2xl', value === 0 && 'text-muted')}>{value}</span>
        <span className="block text-xs text-muted">{label}</span>
      </p>
    </div>
  );
}

/** Sticky under the TopBar. Place it above a day's card, not inside one that clips (overflow-hidden). */
export function DayHeader({ children }: { children: ReactNode }) {
  return (
    <h2 className="sticky top-(--cn-topbar) z-[1] bg-bg px-4 py-2 text-sm font-semibold text-muted">{children}</h2>
  );
}

export interface MeetingRowProps {
  to: string;
  title: string;
  meta: string;
  trailing?: string;
  status?: ReactNode;
  menu?: ReactNode;
}

/** The row is one link; the overflow menu sits beside it, never inside. */
export function MeetingRow({ to, title, meta, trailing, status, menu }: MeetingRowProps) {
  return (
    <div className="group flex items-center gap-1 border-b border-border last:border-b-0 hover:bg-surface-sunken">
      <Link to={to} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4">
        <span className="min-w-0 flex-1">
          <span title={title} className="block truncate font-semibold">
            {title}
          </span>
          <span className="block truncate text-sm text-muted">{meta}</span>
          {status && <span className="mt-1 block">{status}</span>}
        </span>
        {trailing && <span className="shrink-0 font-mono text-xs text-muted">{trailing}</span>}
      </Link>
      <div className="pr-1">{menu}</div>
    </div>
  );
}
