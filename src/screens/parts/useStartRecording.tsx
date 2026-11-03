import { useState } from 'react';
import { useNavigate } from 'react-router';
import { getSettings, setSetting } from '../../data';
import { recorder } from '../../speech/recorder';
import { ConfirmDialog } from '../../ui';

/**
 * Starts a recording from a tap. The first time, it shows a short consent reminder.
 * Mic problems go to S10; another tab already recording shows a toast-worthy error state.
 */
export function useStartRecording() {
  const navigate = useNavigate();
  const [askConsent, setAskConsent] = useState(false);

  async function begin() {
    const s = await getSettings();
    const id = await recorder.start({ mode: s.connectivityMode, online: navigator.onLine, language: s.language, deviceModel: s.offlineModel === 'ready' });
    if (id) navigate('/record');
    else if (recorder.get().micError === 'busy') navigate('/record');
    else navigate('/mic-help');
  }

  async function start() {
    const s = await getSettings();
    if (!s.consentAcknowledged) setAskConsent(true);
    else await begin();
  }

  const consentDialog = (
    <ConfirmDialog
      open={askConsent}
      destructive={false}
      title="Before your first recording"
      body={
        <>
          Let everyone in the conversation know you're recording and get their OK. In some places,
          including several Australian states, recording a private conversation without consent is against the law.
        </>
      }
      confirmLabel="I'll ask first, start"
      onCancel={() => setAskConsent(false)}
      onConfirm={async () => {
        setAskConsent(false);
        await setSetting('consentAcknowledged', true);
        await begin();
      }}
    />
  );

  return { start, consentDialog };
}
