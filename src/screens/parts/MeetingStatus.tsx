import type { Meeting } from '../../db/schema';
import { Badge } from '../../ui';

/** Status pill for a meeting row. Nothing for a finished meeting. */
export function MeetingStatus({ meeting }: { meeting: Meeting }) {
  if (meeting.status === 'recording') return <Badge tone="danger">Recording</Badge>;
  if (meeting.aiStatus === 'running') return <Badge tone="accent">Summarising</Badge>;
  if (meeting.aiStatus === 'failed') return <Badge tone="danger">Summary failed</Badge>;
  if (meeting.aiStatus === 'pending' && meeting.status !== 'done') return <Badge tone="warning">Summary queued</Badge>;
  return null;
}
