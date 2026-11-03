import { LoaderCircle, Mic, Square } from 'lucide-react';
import { DICTATION_PROBLEMS, type useDictation } from '../../speech/useDictation';
import { cx } from '../../ui';

type Dictation = ReturnType<typeof useDictation>;

/** Round mic toggle for a text box, plus the live words and any problem underneath. */
export function MicButton({ dictation, label = 'Dictate' }: { dictation: Dictation; label?: string }) {
  const { state } = dictation;
  const listening = state === 'listening';
  const busy = state === 'starting' || state === 'stopping';
  return (
    <button
      type="button"
      onClick={() => void dictation.toggle()}
      aria-pressed={listening}
      aria-label={listening ? 'Stop dictating' : label}
      title={listening ? 'Stop dictating' : label}
      disabled={busy}
      className={cx(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-pill transition-colors duration-(--cn-motion-fast)',
        listening ? 'bg-danger text-on-danger animate-[cn-pulse_1.6s_ease-out_infinite]' : 'bg-accent-soft text-accent hover:bg-accent/15',
        busy && 'opacity-60',
      )}
    >
      {busy ? <LoaderCircle aria-hidden className="size-5 animate-spin" /> : listening ? <Square aria-hidden className="size-4 fill-current" /> : <Mic aria-hidden className="size-5" />}
    </button>
  );
}

export function DictationStatus({ dictation }: { dictation: Dictation }) {
  if (dictation.problem) return <p role="alert" className="text-sm text-danger">{DICTATION_PROBLEMS[dictation.problem]}</p>;
  if (dictation.state !== 'listening') return null;
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted">
      <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-pill bg-danger" />
      {dictation.partial ? <span className="italic">{dictation.partial}</span> : 'Listening… speak, then pause.'}
    </p>
  );
}

/** Appends a dictated phrase to existing text with sensible spacing. */
export function appendPhrase(current: string, phrase: string): string {
  const p = phrase.trim();
  if (!p) return current;
  if (!current.trim()) return p.charAt(0).toUpperCase() + p.slice(1);
  return `${current.replace(/\s+$/, '')}${/[.!?]$/.test(current.trim()) ? ' ' : current.endsWith(' ') ? '' : ' '}${p}`;
}
