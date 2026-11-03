import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { MessageCircleQuestion, Trash2 } from 'lucide-react';
import { db } from '../db/schema';
import { clearThread, librarySnippets } from '../data/chat';
import { useSettings } from '../data';
import { EmptyState, IconButton, Skeleton, TopBar } from '../ui';
import { ChatPanel } from './parts/ChatPanel';

/** S07 Ask: questions across every meeting. Matching happens on the device; only matches are sent. */
export function Ask() {
  const settings = useSettings();
  const meetingCount = useLiveQuery(() => db.meetings.count(), []);
  const hasThread = useLiveQuery(async () => (await db.chatMessages.where('[thread+createdAt]').between(['global', -Infinity], ['global', Infinity]).count()) > 0, []);

  return (
    <>
      <TopBar
        title="Ask"
        actions={hasThread ? <IconButton label="Clear conversation" onClick={() => void clearThread('global')}><Trash2 aria-hidden className="size-5" /></IconButton> : undefined}
      />
      <div className="mx-auto max-w-(--cn-content-max)">
        {meetingCount === undefined ? (
          <div className="p-4"><Skeleton lines={3} /></div>
        ) : meetingCount === 0 ? (
          <EmptyState
            icon={MessageCircleQuestion}
            title="Nothing to ask about yet"
            body="Once you've recorded a meeting, ask things like what was decided or who owes you a reply."
            action={<Link to="/" className="inline-flex h-11 items-center rounded-md bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent/90">Record a meeting</Link>}
          />
        ) : (
          <ChatPanel
            thread="global"
            label="Ask about your meetings"
            placeholder="Ask about any meeting…"
            suggestions={['What did we decide this week?', 'Who said they would follow up?', 'What risks came up recently?']}
            getSnippets={librarySnippets}
            offlineOnly={settings?.connectivityMode === 'offline_only'}
            emptyHint={<p className="text-sm text-muted">Answers come from your own meetings and link back to them.</p>}
          />
        )}
      </div>
    </>
  );
}
