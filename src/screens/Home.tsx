import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, CloudOff, MicVocal, NotebookPen, Sparkles } from 'lucide-react';
import { homeStats, listMeetings, loadSampleData, meetingTitle, setSetting, useSettings } from '../data';
import { useOnline } from '../app/connectivity';
import { durationLabel, relativeLabel, timeLabel } from '../app/format';
import { useRecorder } from '../speech/recorder';
import { Avatar, Badge, Banner, Button, EmptyState, MeetingRow, RecordButton, Skeleton, StatTile } from '../ui';
import { MeetingStatus } from './parts/MeetingStatus';
import { useStartRecording } from './parts/useStartRecording';
import { isStandalone } from './Install';

function greeting(h = new Date().getHours()) {
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** S02 Home: start a recording, today's numbers, recent meetings. */
export function Home() {
  const settings = useSettings();
  const navigate = useNavigate();
  const online = useOnline();
  const rec = useRecorder();
  const recent = useLiveQuery(() => listMeetings({ limit: 5 }), []);
  const stats = useLiveQuery(homeStats, []);
  const { start, consentDialog } = useStartRecording();
  const [loadingSamples, setLoadingSamples] = useState(false);

  const name = settings?.displayName.trim();
  const offlineOnly = settings?.connectivityMode === 'offline_only';
  const showInstall = settings && !settings.installBannerDismissed && !isStandalone() && matchMedia('(pointer: coarse)').matches;

  return (
    <div className="mx-auto max-w-(--cn-content-max) space-y-6 px-4 pt-safe pb-8">
      <header className="flex items-center gap-3 pt-6">
        <Avatar name={name ?? ''} size="lg" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl">{greeting()}{name ? `, ${name}` : ''}</h1>
          <p className="text-sm text-muted">Your meetings and notes, kept on this device.</p>
        </div>
      </header>

      {!online && (
        <Banner tone="warning">
          You're offline. Recording still works; summaries will be written when you're back online.
        </Banner>
      )}
      {online && offlineOnly && (
        <Banner tone="info">Offline-only mode is on. Nothing leaves this device, and summaries wait until you turn it off.</Banner>
      )}
      {showInstall && (
        <Banner tone="info" action={<Button size="sm" variant="secondary" onClick={() => location.assign('#/install')}>How</Button>} onDismiss={() => void setSetting('installBannerDismissed', true)}>
          Add Creative Notes to your home screen to open it in one tap.
        </Banner>
      )}

      <section aria-labelledby="start-heading" className="flex flex-col items-center gap-4 rounded-xl bg-surface px-6 py-8 text-center shadow-card">
        <h2 id="start-heading" className="sr-only">Start</h2>
        <RecordButton
          state={rec.status === 'idle' ? 'idle' : rec.status === 'starting' ? 'starting' : 'recording'}
          label={rec.status === 'idle' || rec.status === 'starting' ? undefined : 'Back to recording'}
          onToggle={() => (rec.status === 'idle' ? void start() : navigate('/record'))}
        />
        <p className="max-w-xs text-sm text-muted">
          {rec.status === 'idle' ? 'Tap to transcribe a meeting, call or lecture as it happens.' : 'A meeting is recording. Tap to go back to it.'}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link to="/quick" className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-sunken">
            <NotebookPen aria-hidden className="size-5" /> Quick note
          </Link>
          {!online && <Badge tone="warning" icon={<CloudOff aria-hidden className="size-3.5" />}>Offline</Badge>}
        </div>
      </section>

      <section aria-label="Today at a glance" className="grid grid-cols-3 gap-3">
        <StatTile value={stats?.today ?? 0} label="Meetings today" />
        <StatTile value={stats?.insights ?? 0} label="Insights" />
        <StatTile value={stats?.openActions ?? 0} label="Open actions" />
      </section>

      <section aria-labelledby="recent-heading" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 id="recent-heading" className="text-lg">Recent</h2>
          {recent && recent.length > 0 && (
            <Link to="/history" className="inline-flex h-11 items-center gap-1 px-2 text-sm font-semibold text-accent">
              See all <ChevronRight aria-hidden className="size-4" />
            </Link>
          )}
        </div>
        {recent === undefined ? (
          <div className="rounded-lg bg-surface p-4 shadow-card"><Skeleton lines={4} label="Loading recent meetings" /></div>
        ) : recent.length === 0 ? (
          <div className="rounded-lg bg-surface shadow-card">
            <EmptyState
              icon={MicVocal}
              title="No meetings yet"
              body="Your first recording will show up here with its summary and action items."
              action={
                <Button variant="secondary" loading={loadingSamples} icon={<Sparkles aria-hidden className="size-5" />} onClick={async () => {
                  setLoadingSamples(true);
                  await loadSampleData();
                  setLoadingSamples(false);
                }}>
                  Try with sample meetings
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg bg-surface shadow-card">
            {recent.map((m) => (
              <MeetingRow
                key={m.id}
                to={`/m/${m.id}`}
                title={meetingTitle(m)}
                meta={[timeLabel(m.startedAt), durationLabel(m.durationS), m.speakerCount ? `${m.speakerCount} speakers` : ''].filter(Boolean).join(' · ')}
                trailing={relativeLabel(m.startedAt)}
                status={<MeetingStatus meeting={m} />}
              />
            ))}
          </div>
        )}
      </section>
      {consentDialog}
    </div>
  );
}
