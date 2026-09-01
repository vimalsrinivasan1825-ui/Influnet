"use client";

import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGuides } from "./use-guides";

/**
 * Settings control: clear the per-device "seen" set so every section's guide
 * auto-plays once again on the next visit.
 */
export function GuideReplayControl() {
  const resetSeen = useGuides((s) => s.resetSeen);
  const seenCount = useGuides((s) => s.seen.length);
  const [done, setDone] = useState(false);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-content-muted">
        The short walkthrough for each section plays once, the first time you open it.
        Reset it to see them all again — or open any one any time from the{" "}
        <span className="font-semibold text-content-soft">play icon</span> in the top bar.
      </div>
      <Button
        variant="surface"
        onClick={() => {
          resetSeen();
          setDone(true);
          setTimeout(() => setDone(false), 2500);
        }}
        disabled={done}
      >
        {done ? <Check className="size-4" /> : <RotateCcw className="size-4" />}
        {done ? "Reset" : seenCount > 0 ? `Replay guides (${seenCount} watched)` : "Replay guides"}
      </Button>
    </div>
  );
}
