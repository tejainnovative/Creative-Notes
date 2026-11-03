import { Cloud, Smartphone } from 'lucide-react';
import { Badge } from './Data';
import { cx } from './cx';

const speakerColors = [
  'bg-speaker-1',
  'bg-speaker-2',
  'bg-speaker-3',
  'bg-speaker-4',
  'bg-speaker-5',
  'bg-speaker-6',
];

/** Speaker index is the order of first appearance; colours cycle after six. */
export function SpeakerLabel({ name, index }: { name: string; index: number }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold text-fg">
      <span aria-hidden className={cx('size-2 shrink-0 rounded-pill', speakerColors[index % speakerColors.length])} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

interface LineProps {
  text: string;
  atMs: number;
  speaker?: { name: string; index: number };
  partial?: boolean;
  highlighted?: boolean;
  insight?: boolean;
}

export function TranscriptLine({ text, atMs, speaker, partial, highlighted, insight }: LineProps) {
  return (
    <li
      className={cx(
        'border-l-2 px-4 py-2',
        insight ? 'border-accent' : 'border-transparent',
        highlighted && 'bg-warning-soft',
      )}
    >
      <div className="flex items-center gap-2">
        {speaker && <SpeakerLabel name={speaker.name} index={speaker.index} />}
        <time className="font-mono text-xs text-muted">{formatClock(atMs)}</time>
      </div>
      <p className={cx('mt-0.5', partial && 'text-muted')}>
        {text}
        {partial && (
          <span aria-hidden className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-accent animate-[cn-blink_1s_steps(1)_infinite]" />
        )}
      </p>
    </li>
  );
}

/** Mic level bars. Decorative: the recording badge carries the state. */
export function Waveform({ levels }: { levels: number[] }) {
  return (
    <div aria-hidden className="flex h-8 items-center gap-0.5">
      {levels.map((l, i) => (
        <span
          key={i}
          className={cx('w-1 rounded-pill transition-[height] duration-(--cn-motion-fast)', l > 0.05 ? 'bg-accent/70' : 'bg-border')}
          style={{ height: `${Math.max(8, Math.min(100, l * 100))}%` }}
        />
      ))}
    </div>
  );
}

export type RecordingStatus = 'recording' | 'paused' | 'reconnecting';
export type Engine = 'cloud' | 'device';

export function RecordingBadge({ status, engine }: { status: RecordingStatus; engine: Engine }) {
  const text = status === 'recording' ? 'Recording' : status === 'paused' ? 'Paused' : 'Reconnecting…';
  return (
    <div className="flex items-center gap-2">
      <span role="status" className={cx('inline-flex items-center gap-1.5 text-sm font-semibold', status === 'recording' ? 'text-danger' : 'text-warning')}>
        <span aria-hidden className={cx('size-2 rounded-pill', status === 'recording' ? 'bg-danger animate-pulse' : 'bg-warning')} />
        {text}
      </span>
      {engine === 'cloud' ? (
        <Badge tone="accent" icon={<Cloud aria-hidden className="size-3.5" />}>Cloud</Badge>
      ) : (
        <Badge tone="success" icon={<Smartphone aria-hidden className="size-3.5" />}>On device</Badge>
      )}
    </div>
  );
}
