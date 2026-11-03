import { MonitorX } from 'lucide-react';

/** What this browser lacks. Checked once at start-up by the shell. */
export function missingFeatures(): string[] {
  const missing: string[] = [];
  if (!('indexedDB' in window)) missing.push('Storing notes on this device (IndexedDB)');
  if (!window.isSecureContext) missing.push('A secure (https) connection');
  if (!crypto?.getRandomValues) missing.push('Secure random numbers');
  return missing;
}

/** S11 Unsupported browser. Rendered by the shell before anything touches the database. */
export function Unsupported({ missing = missingFeatures() }: { missing?: string[] }) {
  return (
    <div className="mx-auto max-w-md space-y-5 px-6 py-16">
      <span className="inline-flex size-16 items-center justify-center rounded-pill bg-warning-soft text-warning"><MonitorX aria-hidden className="size-8" /></span>
      <h1 className="text-2xl">This browser can't run Creative Notes</h1>
      {missing.length > 0 && (
        <>
          <p className="text-muted">It's missing:</p>
          <ul className="list-disc space-y-1 pl-5">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
        </>
      )}
      <p className="text-muted">
        Open it in a recent version of Chrome, Edge or Safari. Private browsing modes can also block storage, so try a normal window.
      </p>
    </div>
  );
}
