import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { ChevronLeft, Clock, House, ListTodo, Settings, Sparkles } from 'lucide-react';
import { IconButton } from './Button';
import { cx } from './cx';

const items = [
  { to: '/', label: 'Home', Icon: House, end: true },
  { to: '/tasks', label: 'Tasks', Icon: ListTodo, end: false },
  { to: '/ask', label: 'Ask', Icon: Sparkles, end: false },
  { to: '/history', label: 'History', Icon: Clock, end: false },
  { to: '/settings', label: 'Settings', Icon: Settings, end: false },
];

/** Bottom tab bar below lg, left sidebar from lg up. */
export function NavBar() {
  return (
    <nav
      aria-label="Main"
      className={cx(
        'fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-safe',
        'lg:sticky lg:inset-auto lg:top-0 lg:h-dvh lg:w-(--cn-sidebar) lg:shrink-0 lg:border-t-0 lg:border-r lg:bg-bg lg:pb-0 lg:pt-4',
      )}
    >
      <p className="hidden px-5 pb-4 text-lg lg:block">Creative Notes</p>
      <ul className="grid h-(--cn-tabbar) grid-cols-5 lg:h-auto lg:grid-cols-1 lg:gap-1 lg:px-3">
        {items.map(({ to, label, Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex h-full flex-col items-center justify-center gap-1 text-xs',
                  'lg:h-11 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-md lg:px-3 lg:text-sm',
                  isActive ? 'text-accent lg:bg-accent-soft' : 'text-muted hover:text-fg lg:hover:bg-surface-sunken',
                )
              }
            >
              <Icon aria-hidden className="size-6 lg:size-5" strokeWidth={1.75} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

interface TopBarProps {
  title: ReactNode;
  back?: boolean | string;
  actions?: ReactNode;
  children?: ReactNode;
}

/** Sticky page header. The title is the page's <h1>. */
export function TopBar({ title, back, actions, children }: TopBarProps) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/92 pt-safe backdrop-blur">
      <div className="mx-auto flex h-(--cn-topbar) max-w-(--cn-content-max) items-center gap-2 px-2">
        {back && (
          <IconButton
            label="Back"
            onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
          >
            <ChevronLeft aria-hidden className="size-6" />
          </IconButton>
        )}
        <h1 className={cx('min-w-0 flex-1 truncate', back ? 'text-lg' : 'px-2 text-xl')}>{title}</h1>
        {children}
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
    </header>
  );
}
