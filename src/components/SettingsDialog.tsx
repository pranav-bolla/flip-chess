"use client";

import Link from "next/link";
import { Dialog } from "./Dialog";
import { Segmented, Toggle } from "./Segmented";
import { updatePrefs, usePrefs } from "@/lib/client/prefs";
import type { MotionPref } from "@/lib/storage/storage";

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prefs = usePrefs();
  return (
    <Dialog open={open} onClose={onClose} title="Settings">
      <div className="px-5 pb-5">
        <div className="divide-y divide-line border-y border-line">
          <Toggle label="Sound" checked={prefs.sound} onChange={(sound) => updatePrefs({ sound })} />
          <Toggle label="Show legal moves" checked={prefs.showLegalMoves} onChange={(showLegalMoves) => updatePrefs({ showLegalMoves })} />
          <Toggle label="Coordinates" checked={prefs.showCoordinates} onChange={(showCoordinates) => updatePrefs({ showCoordinates })} />
        </div>
        <div className="mt-4">
          <Segmented<MotionPref>
            label="Animation"
            value={prefs.motion}
            onChange={(motion) => updatePrefs({ motion })}
            options={[
              { value: "full", label: "Full" },
              { value: "reduced", label: "Reduced" },
              { value: "off", label: "Off" },
            ]}
          />
        </div>
        <div className="mt-5 flex justify-between text-[12px] text-faint">
          <Link href="/rules" onClick={onClose} className="hover:text-muted">
            Rules
          </Link>
          <Link href="/rules#credits" onClick={onClose} className="hover:text-muted">
            Credits
          </Link>
        </div>
      </div>
    </Dialog>
  );
}
