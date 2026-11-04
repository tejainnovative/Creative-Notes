import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { NavBar, cx } from '../ui';
import { requestPersistentStorage, runAiJobs, useSettings } from '../data';
import { recoverInterruptedMeetings, useRecorder } from '../speech/recorder';
import { runCleanups } from '../speech/cleanup';
import { refreshServer } from '../net/api';
import { pullInbox } from '../net/inbox';
import { RecordingPill } from './RecordingPill';
import { useReminders } from './reminders';

/** Routes that take the whole screen on phones (no tab bar). */
const FULL_SCREEN = ['/record', '/welcome', '/quick'];
/** Routes that work before onboarding. */
const PRE_ONBOARDING = ['/welcome', '/unsupported', '/mic-help', '/quick', '/install', '/design'];

export function AppShell() {
  const settings = useSettings();
  const { pathname } = useLocation();
  const rec = useRecorder();

  useEffect(() => {
    const root = document.documentElement;
    if (!settings || settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
  }, [settings]);

  useEffect(() => {
    // On start and whenever the connection returns: check the server, pull Siri notes, run queued AI.
    const sync = async () => {
      await recoverInterruptedMeetings();
      void runCleanups().catch(() => {});
      await refreshServer();
      await pullInbox().catch(() => 0);
      await runAiJobs();
    };
    void sync();
    void requestPersistentStorage();
    const onOnline = () => void sync();
    const onOffline = () => void refreshServer();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const timer = setInterval(() => void refreshServer(), 5 * 60_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(timer);
    };
  }, []);

  if (!settings) return null; // first IndexedDB read takes a few ms; avoids a flash of the wrong screen
  if (!settings.onboarded && !PRE_ONBOARDING.some((p) => pathname.startsWith(p))) return <Navigate to="/welcome" replace />;
  return <Shell pathname={pathname} recording={rec.status !== 'idle'} />;
}

/** The signed-in app: nav, content, and the reminder checker (which needs the router). */
function Shell({ pathname, recording }: { pathname: string; recording: boolean }) {
  useReminders();
  const full = FULL_SCREEN.some((p) => pathname.startsWith(p));
  return (
    <div className="lg:flex lg:min-h-dvh">
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }} className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:p-3">
        Skip to content
      </a>
      <div className={cx(full && 'hidden lg:block')}>
        <NavBar />
      </div>
      <main id="main" tabIndex={-1} className={cx('min-w-0 flex-1 focus:outline-none', !full && 'pb-[calc(var(--cn-tabbar)+env(safe-area-inset-bottom))] lg:pb-0')}>
        {recording && !pathname.startsWith('/record') && <RecordingPill />}
        <Outlet />
      </main>
    </div>
  );
}
