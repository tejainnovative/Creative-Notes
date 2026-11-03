import { useEffect, useState } from 'react';
import { CheckCircle2, Download, Mic, Share, SquarePlus } from 'lucide-react';
import { Banner, Button, TopBar } from '../ui';

/** True when running as an installed app (home screen / desktop app window). */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

type Platform = 'ios' | 'android' | 'desktop';
function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
});

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-accent-soft text-sm font-semibold text-accent">{n}</span>
      <div className="pt-0.5">{children}</div>
    </li>
  );
}

/** S14 Install help: per-platform steps and the Siri shortcut. */
export function Install() {
  const [platform, setPlatform] = useState<Platform>(detectPlatform);
  const [canPrompt, setCanPrompt] = useState(!!deferred);
  const installed = isStandalone();

  useEffect(() => {
    const on = () => setCanPrompt(true);
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);

  // The app's own address, including the sub-path on hosts like GitHub Pages.
  const origin = `${location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}`;

  return (
    <>
      <TopBar title="Install on this device" back="/settings" />
      <div className="mx-auto max-w-(--cn-content-max) space-y-6 px-4 py-4 pb-10">
        {installed && <Banner tone="info">You're already using the installed app.</Banner>}

        <div role="radiogroup" aria-label="Device" className="flex gap-2">
          {(['ios', 'android', 'desktop'] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={platform === p} onClick={() => setPlatform(p)}
              className={`h-9 rounded-pill border px-4 text-sm font-semibold ${platform === p ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-surface text-muted'}`}>
              {p === 'ios' ? 'iPhone' : p === 'android' ? 'Android' : 'Computer'}
            </button>
          ))}
        </div>

        <section aria-labelledby="steps" className="space-y-3 rounded-lg bg-surface p-4 shadow-card">
          <h2 id="steps" className="text-lg">Add to your home screen</h2>
          {platform === 'ios' && (
            <ol className="space-y-3">
              <Step n={1}>Open this page in <strong>Safari</strong>.</Step>
              <Step n={2}>Tap <Share aria-label="Share" className="inline size-4 align-text-bottom" /> <strong>Share</strong>.</Step>
              <Step n={3}>Choose <SquarePlus aria-hidden className="inline size-4 align-text-bottom" /> <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</Step>
              <Step n={4}>Open Creative Notes from its icon. iOS may ask for microphone access again the first time.</Step>
            </ol>
          )}
          {platform === 'android' && (
            <ol className="space-y-3">
              <Step n={1}>Open this page in <strong>Chrome</strong>.</Step>
              <Step n={2}>Tap <strong>Install</strong> below, or the menu ⋮ then <strong>Install app</strong>.</Step>
            </ol>
          )}
          {platform === 'desktop' && (
            <ol className="space-y-3">
              <Step n={1}>In Chrome or Edge, use the install icon in the address bar, or <strong>Install</strong> below.</Step>
              <Step n={2}>Creative Notes opens in its own window and works offline.</Step>
            </ol>
          )}
          {platform !== 'ios' && (
            <Button
              disabled={!canPrompt || installed}
              icon={<Download aria-hidden className="size-5" />}
              onClick={async () => {
                await deferred?.prompt();
                deferred = null;
                setCanPrompt(false);
              }}
            >
              {installed ? 'Installed' : canPrompt ? 'Install' : 'Not offered here'}
            </Button>
          )}
          {platform !== 'ios' && !canPrompt && !installed && (
            <p className="text-sm text-muted">This browser hasn't offered to install yet. Use its menu, or try Chrome or Edge.</p>
          )}
        </section>

        <section aria-labelledby="siri" className="space-y-3 rounded-lg bg-surface p-4 shadow-card">
          <h2 id="siri" className="text-lg">Quick notes with Siri (iPhone)</h2>
          <p className="text-sm text-muted">
            Web apps can't add their own Siri commands, but Apple's Shortcuts app can open a quick note for you.
          </p>
          <ol className="space-y-3">
            <Step n={1}>Open <strong>Shortcuts</strong> and tap <strong>+</strong>.</Step>
            <Step n={2}>Add <strong>Dictate Text</strong>.</Step>
            <Step n={3}>Add <strong>URL Encode</strong> on the dictated text.</Step>
            <Step n={4}>
              Add <strong>Open URLs</strong> with:
              <code className="mt-1 block rounded-sm bg-surface-sunken p-2 font-mono text-xs break-all">{origin}/#/quick?text=[URL Encoded Text]</code>
            </Step>
            <Step n={5}>Name it <strong>Creative Note</strong>. Say "Hey Siri, Creative Note", or add it to the Action Button or Control Center.</Step>
          </ol>
          <Banner tone="warning">
            Test it once: if the note opens in Safari instead of the installed app, it's saved in Safari's copy of Creative Notes. A server inbox that fixes this comes with the backend.
          </Banner>
          <p className="text-sm text-muted">
            <Mic aria-hidden className="mr-1 inline size-4 align-text-bottom" />
            For recording, use <code className="font-mono break-all">{origin}/#/record</code>. You'll still tap once to start the microphone.
          </p>
        </section>

        {installed && (
          <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 aria-hidden className="size-4" /> Installed and ready to work offline.</p>
        )}
      </div>
    </>
  );
}
