import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CloudOff, HardDrive, Mic, UserX } from 'lucide-react';
import { setSetting } from '../data';
import { Button } from '../ui';
import { browserSpeechSupported } from '../speech/browserEngine';

const points = [
  { Icon: UserX, title: 'No account', body: 'Nothing to sign up for. Open it and start.' },
  { Icon: HardDrive, title: 'Stays on this device', body: 'Meetings and notes are stored here, not on our servers.' },
  { Icon: CloudOff, title: 'Works offline', body: "Record without a connection; summaries catch up when you're back online." },
];

/** S01 First run: what the app does with your data, then the microphone permission. */
export function Welcome() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [step, setStep] = useState<'intro' | 'mic'>('intro');
  const [asking, setAsking] = useState(false);
  const [denied, setDenied] = useState(false);

  async function finish() {
    await setSetting('displayName', name.trim().slice(0, 40));
    await setSetting('onboarded', true);
    navigate('/', { replace: true });
  }

  async function askMic() {
    setAsking(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      await finish();
    } catch {
      setDenied(true);
    } finally {
      setAsking(false);
    }
  }

  const micAvailable = !!navigator.mediaDevices?.getUserMedia;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-safe pb-safe">
      {step === 'intro' ? (
        <>
          <div className="flex-1 space-y-8 pt-16">
            <div>
              <h1 className="text-display">Creative Notes</h1>
              <p className="mt-3 text-lg font-normal text-muted">Record a meeting. Get the summary, the decisions and who's doing what.</p>
            </div>
            <ul className="space-y-5">
              {points.map(({ Icon, title, body }) => (
                <li key={title} className="flex gap-4">
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill bg-accent-soft text-accent"><Icon aria-hidden className="size-5" /></span>
                  <span>
                    <span className="block font-semibold">{title}</span>
                    <span className="block text-sm text-muted">{body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div>
              <label htmlFor="display-name" className="mb-1 block text-sm font-semibold">What should we call you? <span className="font-normal text-muted">(optional)</span></label>
              <input id="display-name" value={name} maxLength={40} autoComplete="given-name" onChange={(e) => setName(e.target.value)}
                className="h-11 w-full rounded-md border border-border-input bg-surface px-3 text-base" />
            </div>
          </div>
          <div className="py-6">
            <Button size="lg" className="w-full" onClick={() => setStep('mic')}>Continue</Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 space-y-6 pt-16 text-center">
            <span className="mx-auto inline-flex size-20 items-center justify-center rounded-pill bg-accent-soft text-accent"><Mic aria-hidden className="size-10" /></span>
            <h1 className="text-2xl">Allow the microphone</h1>
            <p className="text-muted">Creative Notes only listens while you're recording, and you'll always see when it is.</p>
            {!browserSpeechSupported() && (
              <p className="text-sm text-muted">This browser can't transcribe live speech yet, so recordings will show a demo transcript. Chrome or Edge work best.</p>
            )}
            {denied && (
              <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-fg">
                The microphone was blocked. You can still look around, and allow it later from your browser's site settings.
              </p>
            )}
            {!micAvailable && <p role="alert" className="text-sm text-danger">This browser can't use a microphone here. It needs a secure (https) page.</p>}
          </div>
          <div className="space-y-2 py-6">
            <Button size="lg" className="w-full" loading={asking} disabled={!micAvailable} onClick={() => void askMic()}>Allow microphone</Button>
            <Button size="lg" variant="ghost" className="w-full" onClick={() => void finish()}>{denied ? 'Continue without it' : 'Not now'}</Button>
          </div>
        </>
      )}
    </div>
  );
}
