import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cx } from './cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent/90 active:bg-accent/85',
  secondary: 'bg-surface text-fg border border-border hover:bg-surface-sunken',
  ghost: 'bg-transparent text-fg hover:bg-surface-sunken',
  danger: 'bg-danger text-on-danger hover:bg-danger/90 active:bg-danger/85',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-13 px-5 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, disabled, className, children, type = 'button', onClick, ...rest },
  ref,
) {
  const inert = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      aria-disabled={inert || undefined}
      aria-busy={loading || undefined}
      disabled={disabled}
      onClick={inert ? (e) => e.preventDefault() : onClick}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap select-none',
        'transition-colors duration-(--cn-motion-fast)',
        variants[variant],
        sizes[size],
        inert && 'opacity-50 cursor-not-allowed',
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle aria-hidden className="size-5 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'md' | 'sm';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-md text-fg hover:bg-surface-sunken',
        'disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-(--cn-motion-fast)',
        size === 'md' ? 'size-11' : 'size-8',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
