"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { CheckRow } from "@/components/ui/CheckRow";
import { AudioEffectTool } from "./AudioEffectTool";
import { renderBassBoost } from "@/lib/audio/bass-boost";

const MAX_BYTES = 200 * 1024 * 1024;

export function BassBoosterTool() {
  const { t } = useI18n();
  const [gainDb, setGainDb] = useState(6);
  const [highCut, setHighCut] = useState(false);

  return (
    <AudioEffectTool
      titleKey="bassboostertool.title"
      subtitleKey="bassboostertool.subtitle"
      maxBytes={MAX_BYTES}
      fileSuffix="-bass-boosted"
      onProcess={(buffer) => renderBassBoost(buffer, { gainDb, highCut })}
    >
      {(busy) => (
        <>
          <label className="field-label imgtool-quality">
            {t("bassboostertool.boost")} (+{gainDb} dB)
            <input
              type="range"
              min={0}
              max={12}
              value={gainDb}
              disabled={busy}
              onChange={(event) => setGainDb(Number(event.target.value))}
            />
          </label>
          <CheckRow checked={highCut} onChange={setHighCut} disabled={busy}>
            {t("bassboostertool.highCut")}
          </CheckRow>
          <p className="tool-note">{gainDb >= 9 ? t("bassboostertool.clipWarning") : t("bassboostertool.safetyNote")}</p>
        </>
      )}
    </AudioEffectTool>
  );
}
