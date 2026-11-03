import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { dueReminders, markReminded, type Task } from '../data';
import { useToast } from '../ui';

/**
 * Shows task reminders that have come due. Runs while the app is open: on start, every
 * 30 seconds, and whenever the app comes back to the front, so a reminder that fell due
 * while it was closed shows as soon as it's opened. (Web apps can't wake a closed phone;
 * "Add to calendar" covers that.)
 */
export function useReminders() {
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let stopped = false;

    async function notify(t: Task) {
      const title = 'Reminder';
      const body = `${t.owner ? `${t.owner}: ` : ''}${t.text}`;
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          // A service-worker notification also works on Android and in the installed app.
          const reg = await navigator.serviceWorker?.getRegistration();
          if (reg) await reg.showNotification(title, { body, tag: t.key, data: { url: `${import.meta.env.BASE_URL}#/tasks` } });
          else new Notification(title, { body, tag: t.key });
        } catch {
          // fall through to the in-app message only
        }
      }
    }

    async function check() {
      if (stopped) return;
      const due = await dueReminders();
      if (!due.length) return;
      for (const t of due) {
        await markReminded(t);
        await notify(t);
      }
      const first = due[0]!;
      toast({
        tone: 'info',
        text: due.length === 1 ? `Reminder: ${first.text}` : `${due.length} reminders: ${first.text} and more`,
        action: { label: 'Open', onClick: () => navigate('/tasks') },
      });
    }

    void check();
    const timer = setInterval(() => void check(), 30_000);
    const onVisible = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [toast, navigate]);
}
