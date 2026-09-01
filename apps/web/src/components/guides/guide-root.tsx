"use client";

/**
 * Everything the guide system needs mounted once, app-wide: the modal and the
 * contextual auto-run host. Dropped into the dashboard shell. The launcher
 * button lives in the header separately.
 */

import type { UserRole } from "@/types";
import { GuideModal } from "./guide-modal";
import { GuideAutoRunHost } from "./guide-autorun-host";

export function GuideRoot({ role }: { role?: UserRole | null }) {
  return (
    <>
      <GuideAutoRunHost role={role} />
      <GuideModal />
    </>
  );
}
