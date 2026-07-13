"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AudioEffectTool } from "./AudioEffectTool";
import { renderEightD } from "@/lib/audio/eight-d";

const MAX_BYTES = 200 * 1024 * 1024;

export function EightDTool() {
  const { t } = useI18n();
  const [periodSeconds, setPeriodSeconds] = useState(10);
  const [reverbAmount, setReverbAmount] = useState(25);

  return (
    <AudioEffectTool
      titleKey="eightdtool.title"
      subtitleKey="eightdtool.subtitle"
      maxBytes={MAX_BYTES}
      fileSuffix="-8d"
      onProcess={(buffer) => renderEightD(buffer, { periodSeconds, reverbAmount })}
    >
      {(busy) => (
        <>
          <label className="field-label imgtool-quality">
            {t("eightdtool.speed")} ({periodSeconds}s)
            <input
              type="range"
              min={4}
              max={20}
              value={periodSeconds}
              disabled={busy}
              onChange={(event) => setPeriodSeconds(Number(event.target.value))}
            />
          </label>
          <label className="field-label imgtool-quality">
            {t("eightdtool.reverb")} ({reverbAmount}%)
            <input
              type="range"
              min={0}
              max={100}
              value={reverbAmount}
              disabled={busy}
              onChange={(event) => setReverbAmount(Number(event.target.value))}
            />
          </label>
          <p className="tool-note">{t("eightdtool.headphonesNote")}</p>
        </>
      )}
    </AudioEffectTool>
  );
}
