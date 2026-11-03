import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';
import { meetingTitle, type MeetingDetail } from './meetings';
import { formatClock } from '../ui/Transcript';
import { durationLabel } from '../app/format';

export type ExportFormat = 'md' | 'pdf' | 'ics';

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'meeting';
}

function headerLines(d: MeetingDetail): string[] {
  const m = d.meeting;
  const when = new Date(m.startedAt).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
  return [when, [durationLabel(m.durationS), m.speakerCount ? `${m.speakerCount} speakers` : ''].filter(Boolean).join(' · ')].filter(Boolean);
}

export function toMarkdown(d: MeetingDetail): string {
  const s = d.summary;
  const out = [`# ${meetingTitle(d.meeting)}`, '', ...headerLines(d).map((l) => `_${l}_`), ''];
  if (s?.overview) out.push('## Summary', '', s.overview, '');
  if (s?.decisions?.length) out.push('## Decisions', '', ...s.decisions.map((x) => `- ${x}`), '');
  if (d.actions.length)
    out.push('## Action items', '', ...d.actions.map((a) => `- [${a.done ? 'x' : ' '}] ${a.owner ? `**${a.owner}:** ` : ''}${a.text}${a.dueText ? ` _(by ${a.dueText})_` : ''}`), '');
  if (s?.keyTopics?.length) out.push('## Key topics', '', ...s.keyTopics.map((t) => `- **${t.title}**${t.detail ? `: ${t.detail}` : ''}`), '');
  if (d.manualNotes.length) out.push('## Notes', '', ...d.manualNotes.map((n) => `- ${formatClock(n.atMs)} ${n.text}`), '');
  if (d.segments.length)
    out.push('## Transcript', '', ...d.segments.map((g) => `**${formatClock(g.startMs)}${g.speaker ? ` ${g.speaker}` : ''}:** ${g.text}`), '');
  out.push('---', '_Exported from Creative Notes_');
  return out.join('\n');
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** Plain-text PDF built in the browser. The standard fonts only cover Latin-1, so other characters become '?'. */
export async function toPdf(d: MeetingDetail): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 56;
  const pageW = 595;
  const pageH = 842;
  const width = pageW - margin * 2;
  let page = pdf.addPage([pageW, pageH]);
  let y = pageH - margin;
  const safe = (t: string) => t.replace(/[^\x20-\x7e\xa0-\xff\n]/g, '?');

  const write = (text: string, { size = 11, font = regular, gap = 4 } = {}) => {
    for (const line of wrap(safe(text), font, size, width)) {
      if (y < margin + size) {
        page = pdf.addPage([pageW, pageH]);
        y = pageH - margin;
      }
      page.drawText(line, { x: margin, y: y - size, size, font });
      y -= size + gap;
    }
  };
  const heading = (t: string) => {
    y -= 10;
    write(t, { size: 14, font: bold, gap: 6 });
  };

  write(meetingTitle(d.meeting), { size: 20, font: bold, gap: 8 });
  for (const l of headerLines(d)) write(l, { size: 10 });
  const s = d.summary;
  if (s?.overview) (heading('Summary'), write(s.overview));
  if (s?.decisions?.length) (heading('Decisions'), s.decisions.forEach((x) => write(`- ${x}`)));
  if (d.actions.length) (heading('Action items'), d.actions.forEach((a) => write(`[${a.done ? 'x' : ' '}] ${a.owner ? `${a.owner}: ` : ''}${a.text}${a.dueText ? ` (by ${a.dueText})` : ''}`)));
  if (s?.keyTopics?.length) (heading('Key topics'), s.keyTopics.forEach((t) => write(`- ${t.title}${t.detail ? `: ${t.detail}` : ''}`)));
  if (d.segments.length) (heading('Transcript'), d.segments.forEach((g) => write(`${formatClock(g.startMs)}${g.speaker ? ` ${g.speaker}` : ''}: ${g.text}`, { size: 10 })));
  return pdf.save();
}

function icsEscape(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function icsDate(ms: number) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Action items as calendar events. Items with a parsed due date get that date;
 * the rest go on the day after the meeting at 9 am local, flagged in the description.
 */
export function toIcs(d: MeetingDetail): string {
  const title = meetingTitle(d.meeting);
  const stamp = icsDate(Date.now());
  const fallback = new Date(d.meeting.startedAt);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(9, 0, 0, 0);
  const events = d.actions.map((a) => {
    const start = a.dueAt ?? fallback.getTime();
    return [
      'BEGIN:VEVENT',
      `UID:${a.id}@creative-notes`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(start + 30 * 60_000)}`,
      `SUMMARY:${icsEscape(`${a.owner ? `${a.owner}: ` : ''}${a.text}`)}`,
      `DESCRIPTION:${icsEscape(`From "${title}"${a.dueText ? `. Due ${a.dueText}.` : '. No due date was mentioned.'}`)}`,
      'END:VEVENT',
    ].join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Creative Notes//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR', ''].join('\r\n');
}

export async function buildExport(d: MeetingDetail, format: ExportFormat): Promise<File> {
  const name = slug(meetingTitle(d.meeting));
  if (format === 'md') return new File([toMarkdown(d)], `${name}.md`, { type: 'text/markdown' });
  if (format === 'ics') return new File([toIcs(d)], `${name}-actions.ics`, { type: 'text/calendar' });
  const bytes = await toPdf(d);
  return new File([bytes.slice().buffer], `${name}.pdf`, { type: 'application/pdf' });
}

export { shareOrDownload } from './files';
