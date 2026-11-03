import { Link } from 'react-router';
import { RotateCcw } from 'lucide-react';
import { Button } from './Button';
import { cx } from './cx';

export interface Citation {
  id: string;
  title: string;
}

interface Props {
  role: 'user' | 'assistant';
  text?: string;
  state?: 'streaming' | 'done' | 'error';
  citations?: Citation[];
  onRetry?: () => void;
}

export function ChatBubble({ role, text = '', state = 'done', citations, onRetry }: Props) {
  const mine = role === 'user';
  return (
    <li className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cx(
          'max-w-[85%] rounded-lg px-4 py-3 text-base',
          mine ? 'rounded-br-sm bg-accent text-on-accent' : 'rounded-bl-sm bg-surface text-fg shadow-card',
        )}
      >
        <span className="sr-only">{mine ? 'You said' : 'Answer'}: </span>
        {state === 'streaming' && !text ? (
          <span aria-label="Writing an answer" className="inline-flex gap-1 py-2">
            {[0, 1, 2].map((i) => (
              <span key={i} aria-hidden className="size-1.5 rounded-pill bg-muted animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </span>
        ) : state === 'error' ? (
          <span className="flex flex-wrap items-center gap-2 text-danger">
            Couldn't answer that.
            {onRetry && (
              <Button size="sm" variant="secondary" icon={<RotateCcw aria-hidden className="size-4" />} onClick={onRetry}>
                Retry
              </Button>
            )}
          </span>
        ) : (
          <p className="whitespace-pre-wrap">{text}</p>
        )}
        {citations && citations.length > 0 && (
          <ul aria-label="Sources" className="mt-2 flex flex-wrap gap-1.5">
            {citations.map((c) => (
              <li key={c.id}>
                <Link to={`/m/${c.id}`} className="inline-flex h-7 max-w-48 items-center truncate rounded-pill bg-accent-soft px-2.5 text-xs text-accent hover:underline">
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
