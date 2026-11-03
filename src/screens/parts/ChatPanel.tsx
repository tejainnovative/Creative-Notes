import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { askInThread, listThread } from '../../data/chat';
import { meetingTitle } from '../../data';
import { AiUnavailableError, type ChatInput } from '../../ai/types';
import { useOnline } from '../../app/connectivity';
import { ChatBubble, Composer, SuggestionChip, type Citation } from '../../ui';

interface Props {
  thread: string;
  label: string;
  placeholder: string;
  suggestions: string[];
  getSnippets: (question: string) => Promise<ChatInput['snippets']>;
  emptyHint?: React.ReactNode;
  offlineOnly?: boolean;
}

/** Shared by the meeting copilot (S03/S04) and Ask (S07). */
export function ChatPanel({ thread, label, placeholder, suggestions, getSnippets, emptyHint, offlineOnly }: Props) {
  const messages = useLiveQuery(() => listThread(thread), [thread]);
  const titles = useLiveQuery(async () => {
    const ids = [...new Set((messages ?? []).flatMap((m) => m.citations ?? []))];
    const ms = await db.meetings.bulkGet(ids);
    return new Map(ms.filter((m) => !!m).map((m) => [m!.id, meetingTitle(m!)]));
  }, [messages]);
  const online = useOnline();
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<{ text: string; state: 'streaming' | 'error'; question: string } | null>(null);
  const endRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages?.length, pending?.text]);

  const blocked = !online ? 'Asking needs a connection. Your notes still work offline.' : offlineOnly ? 'Offline-only mode is on, so nothing is sent for answers.' : undefined;

  async function send(question: string) {
    const q = question.trim();
    if (!q || pending?.state === 'streaming') return;
    setDraft('');
    setPending({ text: '', state: 'streaming', question: q });
    try {
      await askInThread(thread, q, await getSnippets(q), (text) => setPending({ text, state: 'streaming', question: q }));
      setPending(null);
    } catch (err) {
      setPending({ text: err instanceof AiUnavailableError ? 'offline' : '', state: 'error', question: q });
    }
  }

  const cite = (ids?: string[]): Citation[] | undefined => ids?.map((id) => ({ id, title: titles?.get(id) ?? 'Meeting' }));
  const empty = messages && messages.length === 0 && !pending;

  return (
    <div className="flex flex-col gap-4 py-4">
      {empty && (
        <div className="space-y-3 px-4">
          {emptyHint}
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <SuggestionChip key={s} onClick={() => void send(s)}>{s}</SuggestionChip>
            ))}
          </div>
        </div>
      )}
      <ol aria-label="Conversation" className="space-y-3 px-4">
        {messages?.map((m) => (
          <ChatBubble key={m.id} role={m.role} text={m.content} citations={m.role === 'assistant' ? cite(m.citations) : undefined} />
        ))}
        {pending && (
          <>
            {pending.state === 'error' && !messages?.some((m) => m.content === pending.question) && <ChatBubble role="user" text={pending.question} />}
            <ChatBubble role="assistant" text={pending.text} state={pending.state} onRetry={() => void send(pending.question)} />
          </>
        )}
        <li ref={endRef} aria-hidden />
      </ol>
      <div className="px-4">
        <Composer
          label={label}
          value={draft}
          onChange={setDraft}
          onSubmit={() => void send(draft)}
          sending={pending?.state === 'streaming'}
          disabledReason={blocked}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
