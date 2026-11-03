import { Link } from 'react-router';
import { formatClock } from '../ui';
import { useRecorder } from '../speech/recorder';
import { useNow } from './useNow';

/** Shown on every other screen while a meeting is recording, so it's never lost. */
export function RecordingPill() {
  const rec = useRecorder();
  const now = useNow(1000);
  return (
    <Link
      to="/record"
      className="sticky top-0 z-30 flex h-10 items-center justify-center gap-2 bg-danger pt-safe text-sm font-semibold text-on-danger"
    >
      <span aria-hidden className="size-2 animate-pulse rounded-pill bg-on-danger" />
      Recording · <span className="font-mono">{formatClock(now - (rec.startedAt ?? now))}</span> · Back to meeting
    </Link>
  );
}
