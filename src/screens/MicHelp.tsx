import { useNavigate } from 'react-router';
import { Lock, MicOff, RotateCcw } from 'lucide-react';
import { recorder, useRecorder } from '../speech/recorder';
import { Button, TopBar } from '../ui';
import { useStartRecording } from './parts/useStartRecording';

const copy = {
  denied: {
    title: 'The microphone is blocked',
    steps: [
      'Chrome or Edge: tap the icon to the left of the address, open Permissions, and set Microphone to Allow.',
      'Safari on iPhone: open Settings, then Apps, Safari, Microphone, and choose Allow. For the home-screen app, reopen it and allow when asked.',
      'Then come back and try again.',
    ],
  },
  'no-device': {
    title: "We can't find a microphone",
    steps: ['Plug in or connect a microphone or headset.', 'Check that no other app is using it exclusively.', 'Try again.'],
  },
  insecure: {
    title: 'This page needs a secure connection',
    steps: ['Browsers only allow the microphone on https pages.', 'Open Creative Notes from its https address.'],
  },
  unsupported: {
    title: "This browser can't record",
    steps: ['Use a recent version of Chrome, Edge or Safari.'],
  },
  other: {
    title: "The microphone didn't start",
    steps: ['Close other apps that might be using it, then try again.', 'If it keeps happening, restart the browser.'],
  },
  busy: {
    title: 'Already recording somewhere else',
    steps: ['Another Creative Notes tab or window is recording.', 'Stop it there, then try again.'],
  },
} as const;

/** S10 Microphone unavailable: explains the specific problem and how to fix it. */
export function MicHelp() {
  const rec = useRecorder();
  const navigate = useNavigate();
  const { start, consentDialog } = useStartRecording();
  const kind = rec.micError ?? 'other';
  const { title, steps } = copy[kind];

  return (
    <>
      <TopBar title="Microphone" back="/" />
      <div className="mx-auto max-w-md space-y-6 px-6 py-10">
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-danger-soft text-danger">
          {kind === 'insecure' ? <Lock aria-hidden className="size-8" /> : <MicOff aria-hidden className="size-8" />}
        </span>
        <h2 className="text-2xl" role="alert">{title}</h2>
        <ol className="list-decimal space-y-2 pl-5 text-muted">
          {steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <div className="flex flex-wrap gap-2">
          {kind !== 'insecure' && kind !== 'unsupported' && (
            <Button icon={<RotateCcw aria-hidden className="size-5" />} onClick={() => { recorder.clearError(); void start(); }}>Try again</Button>
          )}
          <Button variant="secondary" onClick={() => { recorder.clearError(); navigate('/quick'); }}>Write a note instead</Button>
        </div>
      </div>
      {consentDialog}
    </>
  );
}
