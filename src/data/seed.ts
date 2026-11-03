import { db, type Meeting, type Segment } from '../db/schema';
import { uuidv7 } from '../db/ids';
import { createNote } from './notes';
import { createTodo } from './tasks';
import { enqueueAiJob } from './jobs';

type Line = [speaker: string | undefined, seconds: number, text: string];

interface SampleMeeting {
  title: string;
  daysAgo: number;
  hour: number;
  mode: Meeting['captureMode'];
  lines: Line[];
}

const samples: SampleMeeting[] = [
  {
    title: 'Monday workshop huddle',
    daysAgo: 0,
    hour: 8,
    mode: 'online',
    lines: [
      ['Jordan', 2, "Morning all. Let's go through the board before the first drop-offs."],
      ['Priya', 14, 'Two jobs are still waiting on parts. The bumper for the white hatch should land tomorrow.'],
      ['Jordan', 31, "Okay. I'm worried the second one might slip past Friday if the supplier is slow again."],
      ['Sam', 48, "I'll chase the supplier this morning and get a firm date by tomorrow."],
      ['Jordan', 66, "Good. We'll go with the earlier cut-off for parts orders, 2 pm from now on."],
      ['Priya', 83, 'I can update the roster and send it to everyone by Thursday.'],
      ['Sam', 101, 'What if we text customers when parts arrive instead of calling? Could save us an hour a day.'],
      ['Jordan', 118, 'Agreed, let us try that this week and review on Friday.'],
    ],
  },
  {
    title: 'Insurer call about the assessment backlog and the revised hire car approval process',
    daysAgo: 0,
    hour: 11,
    mode: 'online',
    lines: [
      ['You', 3, 'Thanks for making the time. We have six assessments waiting more than five days.'],
      ['Alex', 19, 'Understood. The delay is on our side, the assessor team is short this fortnight.'],
      ['You', 37, 'Is there a risk the hire car approvals lapse while we wait?'],
      ['Alex', 52, "There is a risk, yes. I'll extend the approvals for those six files by end of the week."],
      ['You', 75, "Great. I will send you the file numbers today so nothing gets missed."],
      ['Alex', 92, 'Decided then: desktop assessments for anything under the threshold, starting Monday.'],
    ],
  },
  {
    title: 'Notes from the site visit',
    daysAgo: 1,
    hour: 14,
    mode: 'offline',
    lines: [
      [undefined, 4, 'Recorded on the device with no signal at the yard.'],
      [undefined, 22, 'The spray booth filter needs replacing, the pressure reading is low.'],
      [undefined, 41, 'Maybe we could move the booth service to the quiet week before Christmas.'],
      [undefined, 63, 'I will book the technician by next week.'],
    ],
  },
  {
    title: 'Weekly planning',
    daysAgo: 6,
    hour: 9,
    mode: 'online',
    lines: [
      ['Jordan', 5, 'Quick one this week. Capacity looks fine until the twentieth.'],
      ['Sam', 21, 'The new apprentice starts Monday. I can take them through the safety induction.'],
      ['Jordan', 40, "We'll go with Sam as their buddy for the first month."],
    ],
  },
];

/** Loads sample meetings and notes. Used from the empty Home screen and Settings. */
export async function loadSampleData(): Promise<void> {
  for (const s of samples) {
    const start = new Date();
    start.setDate(start.getDate() - s.daysAgo);
    start.setHours(s.hour, 0, 0, 0);
    const startedAt = start.getTime();
    const durationS = (s.lines.at(-1)?.[1] ?? 0) + 20;
    const id = uuidv7(startedAt);
    const speakers = new Set(s.lines.map((l) => l[0]).filter(Boolean));
    await db.meetings.add({
      id,
      title: s.title,
      startedAt,
      endedAt: startedAt + durationS * 1000,
      durationS,
      status: 'processing',
      captureMode: s.mode,
      aiStatus: 'pending',
      language: 'en',
      speakerCount: speakers.size || undefined,
      source: 'live',
      createdAt: startedAt,
      updatedAt: startedAt,
    });
    await db.segments.bulkAdd(
      s.lines.map(([speaker, sec, text], i): Segment => ({
        id: uuidv7(startedAt + i),
        meetingId: id,
        speaker,
        text,
        startMs: sec * 1000,
        endMs: (s.lines[i + 1]?.[1] ?? sec + 10) * 1000,
        engine: s.mode === 'offline' ? 'whisper' : 'cloud',
      })),
    );
    await enqueueAiJob(id, 'summary');
  }
  const at = (days: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.getTime();
  };
  await createTodo({ text: 'Order more masking tape and sanding discs', dueAt: at(0, 0) });
  await createTodo({ text: 'Send the monthly figures to the accountant', dueAt: at(2, 0), remindAt: at(2, 9) });
  await createTodo({ text: 'Look into a second spray booth filter supplier' });
  await createNote({ text: 'Ask the paint supplier about the new clear coat pricing.', source: 'typed' });
  await createNote({ text: 'Remember to renew the shop insurance before the end of the month.', source: 'dictated' });
}
