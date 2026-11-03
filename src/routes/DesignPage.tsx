import { useEffect, useState, type ReactNode } from 'react';
import { Download, FileText, History, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import {
  ActionItemRow, Avatar, Badge, Banner, Button, ChatBubble, Composer, ConfirmDialog, DayHeader, Dialog,
  EmptyState, IconButton, InsightCard, MeetingRow, ProgressBar, RecordButton, RecordingBadge, SearchField,
  SegmentedTabs, SettingsGroup, SettingsRow, Skeleton, StatTile, SuggestionChip, Toggle, TopBar, TranscriptLine,
  Waveform, useToast, type RecordState,
} from '../ui';

type Theme = 'system' | 'light' | 'dark';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl">{title}</h2>
      <div className="space-y-4 rounded-lg border border-border bg-bg p-4">{children}</div>
    </section>
  );
}

const LONG = 'Quarterly planning with the regional repair partners and insurers';

/** Design system check: every primitive in its states. Not linked from the app. */
export function DesignPage() {
  const [theme, setTheme] = useState<Theme>('system');
  const [rec, setRec] = useState<RecordState>('idle');
  const [tab, setTab] = useState('transcript');
  const [query, setQuery] = useState('');
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState('');
  const [toggle, setToggle] = useState(true);
  const [done, setDone] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  const levels = Array.from({ length: 24 }, (_, i) => (rec === 'recording' ? 0.2 + Math.abs(Math.sin(i * 1.7)) * 0.7 : 0));

  return (
    <div className="min-h-dvh">
      <TopBar
        title="Design system"
        actions={
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only md:not-sr-only">Theme</span>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as Theme)}
              className="h-9 rounded-md border border-border-input bg-surface px-2"
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        }
      />
      <main className="mx-auto max-w-(--cn-content-max) space-y-10 px-4 py-6">
        <Section title="Type">
          <p className="text-display">44 Display</p>
          <p className="text-2xl">28 Heading</p>
          <p className="text-xl">22 Title</p>
          <p className="text-lg">18 Subtitle</p>
          <p className="text-base">16 Body. The quick summary lands as soon as the meeting ends.</p>
          <p className="text-sm text-muted">14 Secondary text, muted</p>
          <p className="text-xs text-muted">12 Caption · <span className="font-mono">00:42:17</span></p>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger" icon={<Trash2 aria-hidden className="size-5" />}>Delete</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="lg" icon={<Plus aria-hidden className="size-5" />}>Large</Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
            <IconButton label="More options"><MoreHorizontal aria-hidden className="size-5" /></IconButton>
          </div>
        </Section>

        <Section title="Record button">
          <div className="flex flex-wrap items-end justify-around gap-6">
            <RecordButton state={rec} onToggle={() => setRec((s) => (s === 'recording' ? 'idle' : 'recording'))} />
            <RecordButton state="starting" />
            <RecordButton state="disabled" />
            <RecordButton state="recording" compact />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <RecordingBadge status="recording" engine="cloud" />
            <RecordingBadge status="paused" engine="device" />
            <RecordingBadge status="reconnecting" engine="cloud" />
          </div>
          <Waveform levels={levels} />
        </Section>

        <Section title="Stats, rows and badges">
          <div className="grid grid-cols-3 gap-3">
            <StatTile value={3} label="Today" />
            <StatTile value={12} label="Insights" />
            <StatTile value={0} label="Open actions" />
          </div>
          <DayHeader>Today</DayHeader>
          <div className="overflow-hidden rounded-lg bg-surface shadow-card">
            <MeetingRow to="/design" title="Weekly sync" meta="09:00 · 34 min · 4 speakers" trailing="2h"
              menu={<IconButton label="Options for Weekly sync"><MoreHorizontal aria-hidden className="size-5" /></IconButton>} />
            <MeetingRow to="/design" title={LONG} meta="11:30 · 1 h 12 min · 6 speakers" trailing="5h"
              status={<Badge tone="warning">Summary queued</Badge>}
              menu={<IconButton label="Options"><MoreHorizontal aria-hidden className="size-5" /></IconButton>} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>Neutral</Badge>
            <Badge tone="accent">Cloud</Badge>
            <Badge tone="success">On device</Badge>
            <Badge tone="warning">Summary queued</Badge>
            <Badge tone="danger">Failed</Badge>
          </div>
          <div className="flex items-center gap-3">
            <Avatar name="Sam Rivera" />
            <Avatar name="Sam Rivera" size="lg" />
          </div>
        </Section>

        <Section title="Tabs, transcript and insights">
          <SegmentedTabs
            label="Meeting views"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'transcript', label: 'Transcript' },
              { id: 'insights', label: 'Insights', count: 3 },
              { id: 'copilot', label: 'Copilot' },
              { id: 'summary', label: 'Summary', disabled: true },
            ]}
          >
            {(id) =>
              id === 'insights' ? (
                <div className="space-y-3 pt-3">
                  <InsightCard kind="decision" text="Move the parts order cut-off to 2 pm." atMs={612000} fresh />
                  <InsightCard kind="risk" text="Supplier lead times may slip past the end of the month." atMs={845000} />
                  <InsightCard kind="action" text="Jordan to send the revised roster by Thursday." atMs={1203000} />
                </div>
              ) : (
                <ol className="pt-2">
                  <TranscriptLine speaker={{ name: 'Jordan', index: 0 }} atMs={4000} text="Let's start with the backlog from last week." />
                  <TranscriptLine speaker={{ name: 'You', index: 1 }} atMs={11000} text="Two jobs are waiting on parts, the rest are on track." insight />
                  <TranscriptLine speaker={{ name: 'Priya Natarajan-Whitcombe', index: 2 }} atMs={19000} text="I can chase the supplier this afternoon." highlighted />
                  <TranscriptLine atMs={26000} text="Recorded on the device, so no speaker names" />
                  <TranscriptLine speaker={{ name: 'Jordan', index: 0 }} atMs={31000} text="Great, then the next item is" partial />
                </ol>
              )
            }
          </SegmentedTabs>
        </Section>

        <Section title="Summary pieces">
          <ul>
            <ActionItemRow id="1" owner="Jordan" text="Send the revised roster" due="Thu 6 Nov" done={done} onToggle={setDone} />
            <ActionItemRow id="2" owner="Priya" text="Chase the supplier about the two waiting jobs" done={false} />
          </ul>
          <Skeleton lines={3} label="Writing summary" />
          <Banner tone="warning" action={<Button size="sm" variant="secondary">Retry now</Button>}>
            The summary will be written when you're back online.
          </Banner>
          <Banner tone="danger">Microphone access is blocked. Allow it in your browser settings.</Banner>
          <Banner tone="info" onDismiss={() => {}}>Add Creative Notes to your home screen for one-tap recording.</Banner>
          <ProgressBar label="Offline speech model" value={62} max={148} valueText="62 of 148 MB" />
        </Section>

        <Section title="Empty states">
          <EmptyState icon={History} title="No meetings yet" body="Your recordings and notes will show up here."
            action={<Button icon={<Plus aria-hidden className="size-5" />}>New recording</Button>} />
        </Section>

        <Section title="Search, chat and composer">
          <SearchField value={query} onChange={setQuery} />
          <div className="flex flex-wrap gap-2">
            <SuggestionChip onClick={() => setMsg('What did we decide this week?')}>What did we decide this week?</SuggestionChip>
            <SuggestionChip onClick={() => setMsg('Who owes me something?')}>Who owes me something?</SuggestionChip>
          </div>
          <ol className="space-y-3">
            <ChatBubble role="user" text="What's still open from the weekly sync?" />
            <ChatBubble role="assistant" text="Two things: Jordan's roster and Priya's supplier follow-up." citations={[{ id: 'a', title: 'Weekly sync' }, { id: 'b', title: LONG }]} />
            <ChatBubble role="assistant" state="streaming" />
            <ChatBubble role="assistant" state="error" onRetry={() => {}} />
          </ol>
          <Composer label="Ask about your meetings" value={msg} onChange={setMsg} onSubmit={() => setMsg('')} placeholder="Ask anything…" />
          <Composer label="Ask about your meetings (offline)" value="" onChange={() => {}} onSubmit={() => {}} placeholder="Ask anything…" disabledReason="Asking needs a connection. Your notes still work offline." />
          <Composer label="Quick note" variant="note" value={note} onChange={setNote} onSubmit={() => setNote('')} placeholder="Type or dictate a note" />
        </Section>

        <Section title="Settings">
          <SettingsGroup title="Recording">
            <SettingsRow label="Language" value="Detect automatically" onClick={() => {}} />
            <SettingsRow label="Offline only" description="Never send audio or text off this device" control={<Toggle label="Offline only" checked={toggle} onChange={setToggle} />} />
            <SettingsRow label="Notifications" control={<Toggle label="Notifications" checked={false} onChange={() => {}} disabled />} />
          </SettingsGroup>
          <SettingsGroup title="Data">
            <SettingsRow label="Delete everything" danger onClick={() => setConfirm(true)} />
          </SettingsGroup>
        </Section>

        <Section title="Dialogs and toasts">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" icon={<Download aria-hidden className="size-5" />} onClick={() => setSheet(true)}>Export…</Button>
            <Button variant="secondary" onClick={() => toast({ tone: 'success', text: 'Note saved' })}>Success toast</Button>
            <Button variant="secondary" onClick={() => toast({ text: 'Meeting deleted', action: { label: 'Undo', onClick: () => {} } })}>Undo toast</Button>
            <Button variant="secondary" onClick={() => toast({ tone: 'error', text: "Couldn't reach the server. We'll try again." })}>Error toast</Button>
          </div>
        </Section>
      </main>

      <Dialog
        open={sheet}
        onClose={() => setSheet(false)}
        title="Export meeting"
        actions={<Button variant="secondary" onClick={() => setSheet(false)}>Close</Button>}
      >
        <div className="grid gap-2 pt-2">
          {['Markdown (.md)', 'PDF', 'Calendar events (.ics)'].map((f) => (
            <Button key={f} variant="secondary" className="justify-start" icon={<FileText aria-hidden className="size-5" />}>{f}</Button>
          ))}
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        title="Delete everything?"
        body="This removes every meeting and note from this device. It can't be undone."
        confirmLabel="Delete everything"
        onConfirm={() => setConfirm(false)}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
