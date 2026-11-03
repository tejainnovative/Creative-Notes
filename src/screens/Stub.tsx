import { Hammer } from 'lucide-react';
import { EmptyState, TopBar } from '../ui';

/** Placeholder for a screen that's routed but not built yet. */
export function Stub({ id, title, back }: { id: string; title: string; back?: boolean }) {
  return (
    <>
      <TopBar title={title} back={back} />
      <EmptyState icon={Hammer} title={`${title} isn't built yet`} body={`Screen ${id} is on the build list.`} />
    </>
  );
}
