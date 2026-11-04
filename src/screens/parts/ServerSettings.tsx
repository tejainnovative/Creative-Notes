import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { getSettings, setSetting } from '../../data';
import { API, apiFetch, ApiError, refreshServer, useServer } from '../../net/api';
import { Badge, Button, ConfirmDialog, Dialog, SettingsGroup, SettingsRow, useToast } from '../../ui';

interface DeviceRow {
  id: string;
  label: string;
  scope: 'full' | 'inbox:write';
  last_seen_at: number | null;
}

const PAIR_ERRORS: Record<string, string> = {
  wrong_code: "That setup code isn't right.",
  too_many_attempts: 'Too many tries from this network. Wait an hour and try again.',
  not_configured: "The server has no setup code yet. Add SETUP_CODE to the server's settings.",
};

export function defaultLabel() {
  const ua = navigator.userAgent;
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : 'Device';
  return `${device} · ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

export async function pair(setupCode: string, label: string, scope: 'full' | 'inbox:write') {
  const res = await apiFetch('/pair', { body: { setup_code: setupCode.trim(), label: label.trim(), scope }, auth: false });
  return (await res.json()) as { device_id: string; token: string };
}

/** S08 "Server" group: connect this device, see and revoke devices, make a Siri token. */
export function ServerSettings() {
  const server = useServer();
  const toast = useToast();
  const [open, setOpen] = useState<'pair' | 'siri' | 'disconnect' | null>(null);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState(defaultLabel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [devices, setDevices] = useState<{ self: string; devices: DeviceRow[] } | null>(null);
  const [siriToken, setSiriToken] = useState('');
  const [revoke, setRevoke] = useState<DeviceRow | null>(null);

  useEffect(() => {
    if (!server.paired || !server.reachable) return setDevices(null);
    apiFetch('/devices').then((r) => r.json()).then(setDevices).catch(() => setDevices(null));
  }, [server.paired, server.reachable, server.checkedAt]);

  async function connect(scope: 'full' | 'inbox:write') {
    setBusy(true);
    setError('');
    try {
      const r = await pair(code, scope === 'full' ? label : `Siri shortcut · ${label}`, scope);
      if (scope === 'full') {
        await setSetting('deviceToken', r.token);
        await setSetting('deviceId', r.device_id);
        await refreshServer();
        setOpen(null);
        toast({ tone: 'success', text: 'Connected to your server' });
      } else {
        setSiriToken(r.token);
        await refreshServer();
      }
      setCode('');
    } catch (err) {
      setError(err instanceof ApiError ? (PAIR_ERRORS[err.code] ?? "Couldn't connect. Check the address and try again.") : "Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeDevice(d: DeviceRow) {
    setRevoke(null);
    const self = d.id === devices?.self;
    await apiFetch(`/devices/${self ? 'self' : d.id}`, { method: 'DELETE' }).catch(() => {});
    if (self) {
      await setSetting('deviceToken', '');
      await setSetting('deviceId', '');
    }
    await refreshServer();
    toast({ text: self ? 'This device is disconnected' : `Removed ${d.label}` });
  }

  const status = !server.paired
    ? 'Not connected'
    : !server.reachable
      ? 'Connected, server not reachable'
      : [server.ai ? 'AI' : '', server.stt ? 'speech' : '', server.inbox ? 'Siri inbox' : ''].filter(Boolean).join(', ') || 'Connected, nothing configured';

  return (
    <>
      <SettingsGroup title="Your server">
        <SettingsRow
          label="Connection"
          description={server.paired ? 'Summaries, answers and speaker labels use your own server and API keys.' : 'Without it, notes use the on-device preview summariser.'}
          value={<Badge tone={server.paired && server.reachable ? 'success' : 'neutral'}>{status}</Badge>}
        />
        {!server.paired && <SettingsRow label="Connect this device" onClick={() => { setError(''); setOpen('pair'); }} />}
        {server.paired && server.reachable && <SettingsRow label="Create a Siri shortcut token" description="Lets the Shortcut save notes even when it opens in Safari" onClick={() => { setError(''); setSiriToken(''); setOpen('siri'); }} />}
        {devices?.devices.map((d) => (
          <SettingsRow
            key={d.id}
            label={`${d.label}${d.id === devices.self ? ' (this device)' : ''}`}
            description={`${d.scope === 'full' ? 'Full access' : 'Can only add notes'}${d.last_seen_at ? ` · last used ${new Date(d.last_seen_at).toLocaleDateString()}` : ''}`}
            control={<Button size="sm" variant="secondary" onClick={() => setRevoke(d)}>Remove</Button>}
          />
        ))}
      </SettingsGroup>

      <Dialog
        open={open === 'pair'}
        onClose={() => setOpen(null)}
        title="Connect to your server"
        actions={<>
          <Button variant="secondary" onClick={() => setOpen(null)}>Cancel</Button>
          <Button loading={busy} disabled={!code.trim() || !label.trim()} onClick={() => void connect('full')}>Connect</Button>
        </>}
      >
        <p>Enter the setup code you put in the server's settings. You only do this once per device.</p>
        <label htmlFor="setup-code" className="mt-3 mb-1 block text-sm font-semibold text-fg">Setup code</label>
        <input id="setup-code" type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} className="h-11 w-full rounded-md border border-border-input bg-surface px-3 text-base text-fg" />
        <label htmlFor="device-label" className="mt-3 mb-1 block text-sm font-semibold text-fg">Name for this device</label>
        <input id="device-label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} className="h-11 w-full rounded-md border border-border-input bg-surface px-3 text-base text-fg" />
        {error && open === 'pair' && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      </Dialog>

      <Dialog
        open={open === 'siri'}
        onClose={() => { setOpen(null); setSiriToken(''); }}
        title="Siri shortcut token"
        actions={<Button variant="secondary" onClick={() => { setOpen(null); setSiriToken(''); }}>Done</Button>}
      >
        {siriToken ? (
          <div className="space-y-3">
            <p>Copy this now. It won't be shown again. It can only add notes, nothing else.</p>
            <code className="block rounded-sm bg-surface-sunken p-2 font-mono text-xs break-all text-fg">{siriToken}</code>
            <Button variant="secondary" icon={<Copy aria-hidden className="size-4" />} onClick={async () => { await navigator.clipboard.writeText(siriToken); toast({ tone: 'success', text: 'Copied' }); }}>Copy token</Button>
            <p>
              In Shortcuts, after <strong>Dictate Text</strong>, add <strong>Get Contents of URL</strong>: URL <code className="font-mono break-all">{location.origin}{API}/inbox</code>,
              method POST, header <code className="font-mono">Authorization</code> = <code className="font-mono">Bearer</code> + the token, request body JSON with <code className="font-mono">text</code> = Dictated Text.
              Notes arrive next time Creative Notes opens.
            </p>
          </div>
        ) : (
          <>
            <p>Enter the setup code again to create a token for the Shortcut.</p>
            <label htmlFor="siri-code" className="mt-3 mb-1 block text-sm font-semibold text-fg">Setup code</label>
            <input id="siri-code" type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} className="h-11 w-full rounded-md border border-border-input bg-surface px-3 text-base text-fg" />
            {error && open === 'siri' && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
            <div className="mt-4"><Button loading={busy} disabled={!code.trim()} onClick={() => void connect('inbox:write')}>Create token</Button></div>
          </>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!revoke}
        title={revoke?.id === devices?.self ? 'Disconnect this device?' : `Remove ${revoke?.label}?`}
        body={revoke?.id === devices?.self ? 'Summaries will go back to the on-device preview until you connect again. Your notes stay on this device.' : 'Its token stops working straight away.'}
        confirmLabel={revoke?.id === devices?.self ? 'Disconnect' : 'Remove'}
        onCancel={() => setRevoke(null)}
        onConfirm={() => revoke && void revokeDevice(revoke)}
      />
    </>
  );
}

/** For "Delete everything": also drop this device's token on the server. Best effort. */
export async function forgetServer() {
  const { deviceToken } = await getSettings();
  if (deviceToken) await apiFetch('/devices/self', { method: 'DELETE' }).catch(() => {});
}
