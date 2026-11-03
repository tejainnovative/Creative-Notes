import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { NotebookPen } from 'lucide-react';
import { db } from '../db/schema';
import { addManualNote, useSettings } from '../data';
import { meetingSnippets } from '../data/chat';
import { useNow } from '../app/useNow';
import { recorder, useRecorder } from '../speech/recorder';
import { Banner, Button, EmptyState, RecordButton, RecordingBadge, SegmentedTabs, TopBar, TranscriptLine, Waveform, formatClock, useToast } from '../ui';
import { ChatPanel } from './parts/ChatPanel';
import { speakerIndex } from './parts/speakers';
import { useStartRecording } from './parts/useStartRecording';

const NOTICE = {
  'device-model-missing':
    "You're offline and the on-device speech model isn't downloaded, so this meeting shows a demo transcript. Download it in Settings → Offline transcription while you have a connection.",
  'device-model-failed': "The on-device speech model couldn't start, so this meeting shows a demo transcript. Try removing and downloading it again in Settings.",
  'no-browser-speech': "This browser can't transcribe live speech, so this meeting shows a demo transcript. Chrome or Edge can.",
  'cloud-fallback': "Couldn't reach the speech service, so the browser's own transcription is listening instead. Speaker names won't be shown.",
} as const;

/** S03 Live meeting. Open from Home's record button, or straight to #/record (Siri shortcut). */
export function Record() {
  const rec = useRecorder();
  const settings = useSettings();
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow(500);
  const [tab, setTab] = useState('transcript');
  const [note, setNote] = useState('');
  const { start, consentDialog } = useStartRecording();
  const meetingId = rec.meetingId;
  const segments = useLiveQuery(
    () => (meetingId ? db.segments.where('[meetingId+startMs]').between([meetingId, -Infinity], [meetingId, Infinity]).toArray() : []),
    [meetingId],
  );
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [segments?.length, rec.partial]);

  async function stop() {
    const id = await recorder.stop();
    if (id) navigate(`/m/${id}?tab=summary`, { replace: true });
  }

  async function saveNote() {
    if (!meetingId || !note.trim() || !rec.startedAt) return;
    await addManualNote(meetingId, note.trim(), Date.now() - rec.startedAt);
    setNote('');
    toast({ tone: 'success', text: 'Note added to the meeting' });
  }

  if (rec.status === 'idle' || rec.status === 'starting') {
    return (
      <>
        <TopBar title="New recording" back="/" />
        {rec.micError === 'busy' && (
          <div className="mx-auto max-w-(--cn-content-max) px-4 pt-4">
            <Banner tone="warning">Another Creative Notes tab or window is already recording. Stop it there first.</Banner>
          </div>
        )}
        <div className="flex flex-col items-center gap-6 px-6 py-16 text-center">
          <RecordButton state={rec.status === 'starting' ? 'starting' : 'idle'} onToggle={() => void start()} />
          <p className="max-w-xs text-sm text-muted">Nothing is recording. Tap the button when everyone's ready.</p>
        </div>
        {consentDialog}
      </>
    );
  }

  const elapsed = now - (rec.startedAt ?? now);
  const speakers = speakerIndex(segments ?? []);
  const isDemo = rec.engine?.id === 'demo';

  return (
    <div className="flex h-dvh flex-col">
      <TopBar title={formatClock(elapsed)} back="/">
        <RecordingBadge status={rec.status === 'reconnecting' ? 'reconnecting' : 'recording'} engine={rec.engine?.where === 'cloud' ? 'cloud' : 'device'} />
      </TopBar>
      <div className="mx-auto flex w-full max-w-(--cn-content-max) min-h-0 flex-1 flex-col">
        <div className="space-y-3 px-4 pt-3">
          {rec.notice && <Banner tone="info">{NOTICE[rec.notice]}</Banner>}
          {rec.status === 'reconnecting' && <Banner tone="warning">Lost the speech service. Reconnecting, keep talking.</Banner>}
          <Waveform levels={rec.levels} />
        </div>
        <SegmentedTabs
          fill
          label="Meeting views"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'transcript', label: 'Transcript' },
            { id: 'insights', label: 'Insights' },
            { id: 'copilot', label: 'Copilot' },
            { id: 'summary', label: 'Summary', disabled: true },
          ]}
        >
          {(id) =>
            id === 'transcript' ? (
              <div
                ref={listRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                }}
                className="h-full overflow-y-auto"
              >
                {segments?.length === 0 && !rec.partial ? (
                  <p className="px-4 py-10 text-center text-sm text-muted">Listening… start talking and the words will appear here.</p>
                ) : (
                  <ol aria-live="polite" aria-label={isDemo ? 'Demo transcript' : 'Transcript'} className="py-2">
                    {segments?.map((s) => (
                      <TranscriptLine key={s.id} text={s.text ?? ''} atMs={s.startMs} speaker={s.speaker ? { name: s.speaker, index: speakers.get(s.speaker) ?? 0 } : undefined} />
                    ))}
                    {rec.partial && <TranscriptLine text={rec.partial} atMs={elapsed} partial />}
                  </ol>
                )}
              </div>
            ) : id === 'insights' ? (
              <EmptyState icon={NotebookPen} title="Insights come after the meeting" body="Decisions, risks and follow-ups are picked out when the summary is written." />
            ) : (
              <ChatPanel
                thread={meetingId!}
                label="Ask about this meeting"
                placeholder="Ask about what's been said…"
                suggestions={['What has been decided so far?', 'Who said they would do something?']}
                getSnippets={() => meetingSnippets(meetingId!)}
                offlineOnly={settings?.connectivityMode === 'offline_only'}
              />
            )
          }
        </SegmentedTabs>
      </div>
      <footer className="border-t border-border bg-surface pb-safe">
        <div className="mx-auto flex max-w-(--cn-content-max) items-center gap-3 px-4 py-3">
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveNote();
            }}
          >
            <label htmlFor="manual-note" className="sr-only">Add a note to this meeting</label>
            <input
              id="manual-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note…"
              className="h-11 min-w-0 flex-1 rounded-md border border-border-input bg-surface px-3 text-base placeholder:text-muted"
            />
            <Button type="submit" variant="secondary" disabled={!note.trim()}>Add</Button>
          </form>
          <RecordButton state={rec.status === 'stopping' ? 'stopping' : 'recording'} compact onToggle={() => void stop()} />
        </div>
      </footer>
    </div>
  );
}
