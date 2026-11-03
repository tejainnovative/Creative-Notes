import { LoaderCircle, Mic, MicOff, Square } from 'lucide-react';
import { cx } from './cx';

export type RecordState = 'idle' | 'starting' | 'recording' | 'stopping' | 'disabled';

interface Props {
  state: RecordState;
  onToggle?: () => void;
  compact?: boolean;
  showLabel?: boolean;
  /** Overrides the label when the tap does something other than start/stop (e.g. "Back to recording"). */
  label?: string;
}

const labels: Record<RecordState, string> = {
  idle: 'Start recording',
  starting: 'Starting…',
  recording: 'Stop recording',
  stopping: 'Stopping…',
  disabled: 'Recording unavailable',
};

export function RecordButton({ state, onToggle, compact = false, showLabel = true, label }: Props) {
  const text = label ?? labels[state];
  const busy = state === 'starting' || state === 'stopping';
  const disabled = state === 'disabled';
  const Icon = disabled ? MicOff : state === 'recording' ? Square : Mic;
  return (
    <div className="inline-flex flex-col items-center gap-3">
      <button
        type="button"
        aria-pressed={label ? undefined : state === 'recording'}
        aria-busy={busy || undefined}
        aria-label={text}
        disabled={disabled}
        onClick={busy ? undefined : onToggle}
        className={cx(
          'inline-flex items-center justify-center rounded-pill transition-transform duration-(--cn-motion-fast) active:scale-95',
          compact ? 'size-14' : 'size-(--cn-record-button)',
          disabled ? 'bg-surface-sunken text-muted cursor-not-allowed' : 'bg-danger text-on-danger shadow-record',
          state === 'recording' && 'animate-[cn-pulse_1.6s_ease-out_infinite]',
        )}
      >
        {busy ? (
          <LoaderCircle aria-hidden className="size-7 animate-spin" />
        ) : (
          <Icon aria-hidden className={cx(compact ? 'size-6' : 'size-8', state === 'recording' && 'fill-current')} />
        )}
      </button>
      {showLabel && !compact && (
        <span aria-hidden className="text-sm font-semibold text-fg">
          {text}
        </span>
      )}
    </div>
  );
}
