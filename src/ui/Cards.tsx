import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Lightbulb, ListChecks, OctagonAlert, X, type LucideIcon } from 'lucide-react';
import { IconButton } from './Button';
import { formatClock } from './Transcript';
import { cx } from './cx';

export type InsightKind = 'decision' | 'risk' | 'idea' | 'action';

const insightStyle: Record<InsightKind, { label: string; Icon: LucideIcon; tone: string }> = {
  decision: { label: 'Decision', Icon: CheckCircle2, tone: 'text-success' },
  risk: { label: 'Risk', Icon: AlertTriangle, tone: 'text-warning' },
  idea: { label: 'Idea', Icon: Lightbulb, tone: 'text-accent' },
  action: { label: 'Action', Icon: ListChecks, tone: 'text-accent' },
};

export function InsightCard({ kind, text, atMs, fresh }: { kind: InsightKind; text: string; atMs: number; fresh?: boolean }) {
  const { label, Icon, tone } = insightStyle[kind];
  return (
    <article className={cx('rounded-lg border border-border p-4 transition-colors duration-(--cn-motion-slow)', fresh ? 'bg-accent-soft' : 'bg-surface')}>
      <header className="flex items-center gap-2">
        <Icon aria-hidden className={cx('size-4', tone)} />
        <h3 className={cx('text-xs font-semibold', tone)}>{label}</h3>
        <time className="ml-auto font-mono text-xs text-muted">{formatClock(atMs)}</time>
      </header>
      <p className="mt-1 text-sm">{text}</p>
    </article>
  );
}

export interface ActionItemRowProps {
  id: string;
  owner?: string;
  text: string;
  due?: string;
  done: boolean;
  onToggle?: (done: boolean) => void;
}

export function ActionItemRow({ id, owner, text, due, done, onToggle }: ActionItemRowProps) {
  return (
    <li className="flex gap-3 py-2">
      <input
        id={`ai-${id}`}
        type="checkbox"
        checked={done}
        onChange={(e) => onToggle?.(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-(--cn-accent)"
      />
      <label htmlFor={`ai-${id}`} className={cx('min-w-0 text-sm', done && 'text-muted line-through')}>
        {owner && <span className="font-semibold">{owner}: </span>}
        {text}
        {due && <span className="block text-xs text-muted no-underline">by {due}</span>}
      </label>
    </li>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 inline-flex size-16 items-center justify-center rounded-pill bg-accent-soft text-accent">
        <Icon aria-hidden className="size-8" strokeWidth={1.75} />
      </span>
      <h2 className="text-lg">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ lines = 3, label = 'Loading' }: { lines?: number; label?: string }) {
  return (
    <div aria-busy="true" className="space-y-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className={cx('relative h-4 overflow-hidden rounded-sm bg-surface-sunken', i === lines - 1 && 'w-2/3')}
        >
          <span className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-surface/60 to-transparent animate-[cn-shimmer_1.4s_infinite]" />
        </div>
      ))}
    </div>
  );
}

type BannerTone = 'info' | 'warning' | 'danger';
const bannerStyle: Record<BannerTone, { Icon: LucideIcon; cls: string }> = {
  info: { Icon: Info, cls: 'bg-accent-soft text-fg [&_svg]:text-accent' },
  warning: { Icon: AlertTriangle, cls: 'bg-warning-soft text-fg [&_svg]:text-warning' },
  danger: { Icon: OctagonAlert, cls: 'bg-danger-soft text-fg [&_svg]:text-danger' },
};

export function Banner({ tone = 'info', children, action, onDismiss }: { tone?: BannerTone; children: ReactNode; action?: ReactNode; onDismiss?: () => void }) {
  const { Icon, cls } = bannerStyle[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex items-start gap-3 rounded-lg p-3 pl-4', cls)}>
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1 py-0.5 text-sm">{children}</div>
      {action}
      {onDismiss && (
        <IconButton label="Dismiss" size="sm" onClick={onDismiss}>
          <X aria-hidden className="size-4" />
        </IconButton>
      )}
    </div>
  );
}

export function ProgressBar({ label, value, max, valueText }: { label: string; value: number; max: number; valueText: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular text-muted">{valueText}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        className="h-2 overflow-hidden rounded-pill bg-surface-sunken"
      >
        <div className="h-full rounded-pill bg-accent transition-[width] duration-(--cn-motion-base)" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
