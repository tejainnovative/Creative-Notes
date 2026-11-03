import type { SpeechEngine } from './types';

const script: [string, string][] = [
  ['Speaker 1', 'Thanks everyone, this is a short demo meeting so you can see how notes build up.'],
  ['Speaker 2', 'Sounds good. The main thing today is the parts delay on the blue sedan.'],
  ['Speaker 1', "I'm worried it might slip past the end of the week."],
  ['Speaker 2', "I'll call the supplier this afternoon and confirm a delivery date by tomorrow."],
  ['Speaker 1', "Great, we'll go with a courtesy call to the customer once we have that date."],
  ['Speaker 2', 'What if we also offer them a loan car for the extra days?'],
  ['Speaker 1', 'Agreed. I can arrange that by Friday.'],
];

/**
 * Scripted transcript for browsers without live speech recognition, and for tests.
 * The recording badge and the transcript both say it is a demo.
 */
export function createDemoEngine(stepMs = 2600): SpeechEngine {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  return {
    id: 'demo',
    where: 'device',
    async start(h, { elapsed }) {
      stopped = false;
      let i = 0;
      const next = () => {
        if (stopped) return;
        const [speaker, text] = script[i % script.length]!;
        const words = text.split(' ');
        let w = 0;
        const start = elapsed();
        const typeWord = () => {
          if (stopped) return;
          w++;
          if (w < words.length) {
            h.onPartial(words.slice(0, w).join(' '));
            timer = setTimeout(typeWord, stepMs / words.length);
          } else {
            h.onPartial('');
            h.onFinal({ text, speaker, startMs: start, endMs: elapsed() });
            i++;
            timer = setTimeout(next, 400);
          }
        };
        typeWord();
      };
      next();
    },
    async stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
