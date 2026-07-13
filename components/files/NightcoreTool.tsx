"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AudioEffectTool } from "./AudioEffectTool";
import { renderNightcore } from "@/lib/audio/nightcore";

const MAX_BYTES = 200 * 1024 * 1024;
const MIN_RATE = 1.05;
const MAX_RATE = 1.5;

export function NightcoreTool() {
  const { t } = useI18n();
  const [rate, setRate] = useState(1.25);

  return (
    <AudioEffectTool
      titleKey="nightcoretool.title"
      subtitleKey="nightcoretool.subtitle"
      maxBytes={MAX_BYTES}
      fileSuffix="-nightcore"
      onProcess={(buffer) => renderNightcore(buffer, { rate })}
    >
      {(busy) => (
        <label className="field-label imgtool-quality">
          {t("nightcoretool.intensity")} ({rate.toFixed(2)}x)
          <input
            type="range"
            min={Math.round(MIN_RATE * 100)}
            max={Math.round(MAX_RATE * 100)}
            value={Math.round(rate * 100)}
            disabled={busy}
            onChange={(event) => setRate(Number(event.target.value) / 100)}
          />
        </label>
      )}
    </AudioEffectTool>
  );
}
