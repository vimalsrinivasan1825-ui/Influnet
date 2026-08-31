/**
 * Everything the guide system mounts once, app-wide (mobile): the modal and the
 * contextual auto-run host. Dropped into app/_layout.tsx. The launcher button
 * lives in the headers separately.
 */

import { useEffect } from 'react';
import { useSession } from '@/lib/session';
import { GuideAutoRunHost } from './guide-autorun-host';
import { GuideModal } from './guide-modal';
import { useGuides } from './use-guides';

export function GuideRoot() {
  const hydrate = useGuides((s) => s.hydrate);
  const role = useSession((s) => s.profile?.role ?? null);
  const signedIn = useSession((s) => !!s.session);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!signedIn || role === 'admin') return null;

  return (
    <>
      <GuideAutoRunHost />
      <GuideModal />
    </>
  );
}
