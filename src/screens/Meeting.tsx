import { useState, useSyncExternalStore } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileQuestion, Lightbulb, RotateCcw, Share2, Trash2 } from 'lucide-react';
import {
  deleteMeeting, getMeeting, isNetworkWait, meetingTitle, restoreMeeting, retryMeetingSummary, runAiJobs, setActionDone, summaryJob, summaryStream, useSettings,
  type MeetingDetail,
} from '../data';
import { meetingSnippets } from '../data/chat';
import { useOnline } from '../app/connectivity';
import { durationLabel } from '../app/format';
import {
  ActionItemRow, Badge, Banner, Button, ConfirmDialog, EmptyState, IconButton, InsightCard, SegmentedTabs, Skeleton, TopBar, TranscriptLine, useToast,
} from '../ui';
import { ChatPanel } from './parts/ChatPanel';
import { speakerIndex } from './parts/speakers';
import { ExportSheet } from './ExportSheet';
import { db } from '../db/schema';
import { useCleanup } from '../speech/cleanup';

/** Shown while the after-meeting pass re-reads the audio for a cleaner transcript. */
function CleanupBanner({ meetingId }: { meetingId: string }) {
  const hasAudio = useLiveQuery(() => db.audio.where('meetingId').equals(meetingId).count().then((n) => n > 0), [meetingId]);
  const p = useCleanup(meetingId);
  if (!hasAudio && p === undefined) return null;
  return (
    <div className="px-4 pb-2">
      <Banner tone="info">
        {p === undefined ? 'The transcript will be cleaned up on this device shortly, then summarised.' : `Cleaning up the transcript on this device… ${Math.round(p * 100)}%`}
      </Banner>
    </div>
  );
}

/** S04 Meeting detail: summary, transcript, insights and copilot for one meeting. */
export function Meeting() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const detail = useLiveQuery(async () => (await getMeeting(id)) ?? null, [id]);
  const [exportOpen, setExportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (detail === undefined)
    return (
      <>
        <TopBar title="Meeting" back="/history" />
        <div className="mx-auto max-w-(--cn-content-max) p-4"><Skeleton lines={6} label="Loading meeting" /></div>
      </>
    );
  if (detail === null)
    return (
      <>
        <TopBar title="Meeting" back="/history" />
        <EmptyState icon={FileQuestion} title="This meeting isn't here" body="It may have been deleted, or it was recorded on another device." action={<Button onClick={() => navigate('/history')}>Go to history</Button>} />
      </>
    );

  const { meeting } = detail;
  const title = meetingTitle(meeting);
  const tab = params.get('tab') ?? (meeting.aiStatus === 'done' && detail.summary ? 'summary' : 'transcript');
  const when = new Date(meeting.startedAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  async function remove() {
    setConfirmDelete(false);
    const snapshot = await deleteMeeting(id);
    navigate('/history', { replace: true });
    if (snapshot) toast({ text: `Deleted "${title}"`, action: { label: 'Undo', onClick: () => void restoreMeeting(snapshot) } });
  }

  return (
    <>
      <TopBar
        title={title}
        back="/history"
        actions={
          <>
            <IconButton label="Export or share" onClick={() => setExportOpen(true)}><Share2 aria-hidden className="size-5" /></IconButton>
            <IconButton label="Delete meeting" onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden className="size-5" /></IconButton>
          </>
        }
      />
      <div className="mx-auto max-w-(--cn-content-max) pb-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm text-muted">
          <span>{when}</span>
          {meeting.durationS !== undefined && <span>{durationLabel(meeting.durationS)}</span>}
          {meeting.speakerCount && <span>{meeting.speakerCount} speakers</span>}
          <Badge tone={meeting.captureMode === 'offline' ? 'success' : 'accent'}>{meeting.captureMode === 'offline' ? 'On device' : 'Cloud'}</Badge>
        </div>
        <CleanupBanner meetingId={id} />
        <SegmentedTabs
          label="Meeting views"
          value={tab}
          onChange={(t) => setParams({ tab: t }, { replace: true })}
          tabs={[
            { id: 'summary', label: 'Summary' },
            { id: 'transcript', label: 'Transcript' },
            { id: 'insights', label: 'Insights', count: detail.insights.length },
            { id: 'copilot', label: 'Copilot' },
          ]}
        >
          {(t) =>
            t === 'summary' ? <SummaryTab detail={detail} />
            : t === 'transcript' ? <TranscriptTab detail={detail} />
            : t === 'insights' ? <InsightsTab detail={detail} />
            : <CopilotTab meetingId={id} />
          }
        </SegmentedTabs>
      </div>
      <ExportSheet open={exportOpen} onClose={() => setExportOpen(false)} detail={detail} />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this meeting?"
        body={<>"{title}", its transcript, summary and notes will be removed from this device. You can undo for a few seconds.</>}
        confirmLabel="Delete"
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

function SummaryTab({ detail }: { detail: MeetingDetail }) {
  const { meeting, summary, actions } = detail;
  const online = useOnline();
  const settings = useSettings();
  const streamed = useSyncExternalStore(summaryStream.subscribe, () => summaryStream.get(meeting.id));
  const job = useLiveQuery(() => summaryJob(meeting.id), [meeting.id]);

  if (detail.segments.length === 0 && detail.manualNotes.length === 0)
    return <EmptyState icon={FileQuestion} title="Nothing to summarise" body="No speech was picked up in this recording." />;

  if (meeting.aiStatus === 'failed')
    return (
      <div className="p-4">
        <Banner tone="danger" action={<Button size="sm" variant="secondary" icon={<RotateCcw aria-hidden className="size-4" />} onClick={() => void retryMeetingSummary(meeting.id)}>Try again</Button>}>
          The summary couldn't be written after several tries.
        </Banner>
      </div>
    );

  if (meeting.aiStatus !== 'done' || !summary) {
    const waiting = !online || settings?.connectivityMode === 'offline_only';
    const serviceTrouble = !waiting && job?.status === 'queued' && !!job.lastError && !isNetworkWait(job.lastError);
    return (
      <div className="space-y-4 p-4" aria-busy={!waiting && !serviceTrouble}>
        {serviceTrouble ? (
          <Banner tone="warning" action={<Button size="sm" variant="secondary" onClick={() => void retryMeetingSummary(meeting.id)}>Retry now</Button>}>
            The summary service couldn't be reached. It will retry shortly; the transcript is ready now.
          </Banner>
        ) : waiting ? (
          <Banner tone="warning" action={online ? undefined : <Button size="sm" variant="secondary" onClick={() => void runAiJobs()}>Retry now</Button>}>
            {online ? 'Offline-only mode is on, so this summary waits until you turn it off in Settings.' : "The summary will be written when you're back online. The transcript is ready now."}
          </Banner>
        ) : (
          <p role="status" className="text-sm text-muted">Writing the summary…</p>
        )}
        {streamed ? <p className="text-base">{streamed}</p> : !waiting && !serviceTrouble && <Skeleton lines={4} label="Writing the summary" />}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <section aria-labelledby="sum-overview">
        <h2 id="sum-overview" className="mb-1 text-lg">Overview</h2>
        <p>{summary.overview}</p>
      </section>
      {!!summary.decisions?.length && (
        <section aria-labelledby="sum-decisions">
          <h2 id="sum-decisions" className="mb-1 text-lg">Decisions</h2>
          <ul className="list-disc space-y-1 pl-5">{summary.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </section>
      )}
      <section aria-labelledby="sum-actions">
        <h2 id="sum-actions" className="mb-1 text-lg">Action items</h2>
        {actions.length ? (
          <ul>{actions.map((a) => <ActionItemRow key={a.id} id={a.id} owner={a.owner} text={a.text ?? ''} due={a.dueText} done={a.done === 1} onToggle={(d) => void setActionDone(a.id, d)} />)}</ul>
        ) : (
          <p className="text-sm text-muted">No one committed to anything specific.</p>
        )}
        {actions.length > 0 && (
          <Link to="/tasks" className="mt-1 inline-flex h-11 items-center text-sm font-semibold text-accent hover:underline">
            Set due dates and reminders in Tasks
          </Link>
        )}
      </section>
      {!!summary.keyTopics?.length && (
        <section aria-labelledby="sum-topics">
          <h2 id="sum-topics" className="mb-1 text-lg">Key topics</h2>
          <dl className="space-y-2">
            {summary.keyTopics.map((t) => (
              <div key={t.title}>
                <dt className="font-semibold">{t.title}</dt>
                {t.detail && <dd className="text-sm text-muted">{t.detail}</dd>}
              </div>
            ))}
          </dl>
        </section>
      )}
      <p className="text-xs text-muted">Written in {(summary.generatedMs / 1000).toFixed(1)} s · {summary.model}</p>
    </div>
  );
}

function TranscriptTab({ detail }: { detail: MeetingDetail }) {
  const speakers = speakerIndex(detail.segments);
  const demo = detail.segments.some((s) => s.engine === 'demo');
  const items = [
    ...detail.segments.map((s) => ({ key: s.id, at: s.startMs, text: s.text ?? '', speaker: s.speaker })),
    ...detail.manualNotes.map((n) => ({ key: n.id, at: n.atMs, text: `Note: ${n.text}`, speaker: 'You' })),
  ].sort((a, b) => a.at - b.at);
  if (!items.length) return <EmptyState icon={FileQuestion} title="No transcript" body="No speech was picked up in this recording." />;
  return (
    <div className="py-2">
      {demo && <div className="px-4 pb-2"><Banner tone="info">This is a demo transcript, not what was actually said.</Banner></div>}
      <ol aria-label="Transcript">
        {items.map((s) => (
          <TranscriptLine key={s.key} text={s.text} atMs={s.at} speaker={s.speaker ? { name: s.speaker, index: speakers.get(s.speaker) ?? speakers.size } : undefined} />
        ))}
      </ol>
    </div>
  );
}

function InsightsTab({ detail }: { detail: MeetingDetail }) {
  if (!detail.insights.length)
    return (
      <EmptyState
        icon={Lightbulb}
        title={detail.meeting.aiStatus === 'done' ? 'No insights in this one' : 'Insights come with the summary'}
        body={detail.meeting.aiStatus === 'done' ? 'Nothing stood out as a decision, risk, idea or follow-up.' : "They'll appear here once the summary is written."}
      />
    );
  return <div className="space-y-3 p-4">{detail.insights.map((i) => <InsightCard key={i.id} kind={i.kind} text={i.text ?? ''} atMs={i.atMs} />)}</div>;
}

function CopilotTab({ meetingId }: { meetingId: string }) {
  const settings = useSettings();
  return (
    <ChatPanel
      thread={meetingId}
      label="Ask about this meeting"
      placeholder="Ask about this meeting…"
      suggestions={['What did we decide?', 'Who is doing what, and by when?', 'What are the open risks?']}
      getSnippets={() => meetingSnippets(meetingId)}
      offlineOnly={settings?.connectivityMode === 'offline_only'}
      emptyHint={<p className="text-sm text-muted">Ask anything about this meeting. Answers only use what was said in it.</p>}
    />
  );
}
