"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { decodeAudioFile } from "@/lib/audio/decode";
import { analyzeBandCurve, renderMaster, type MasterBandCurve, type MasterStyle } from "@/lib/audio/master";
import { AudioEffectTool } from "./AudioEffectTool";

const MAX_BYTES = 200 * 1024 * 1024;
const REFERENCE_ACCEPT = "audio/*,.mp3,.wav,.flac,.ogg,.oga,.m4a,.aac,.opus,.wma,.aiff,.aif,.weba";

const STYLES: MasterStyle[] = ["balanced", "warm", "bright", "punchy"];
const STYLE_LABELS: Record<MasterStyle, "audiomasteringtool.styleBalanced" | "audiomasteringtool.styleWarm" | "audiomasteringtool.styleBright" | "audiomasteringtool.stylePunchy"> = {
  balanced: "audiomasteringtool.styleBalanced",
  warm: "audiomasteringtool.styleWarm",
  bright: "audiomasteringtool.styleBright",
  punchy: "audiomasteringtool.stylePunchy",
};

// Per-band difference (reference minus source), clamped to +/-6 dB, so the
// master leans toward the reference's tonal balance without extreme moves.
function differenceCurve(reference: MasterBandCurve, source: MasterBandCurve): MasterBandCurve {
  const clamp = (v: number) => Math.max(-6, Math.min(6, v));
  return {
    subDb: clamp(reference.subDb - source.subDb),
    bassDb: clamp(reference.bassDb - source.bassDb),
    lowMidDb: clamp(reference.lowMidDb - source.lowMidDb),
    highMidDb: clamp(reference.highMidDb - source.highMidDb),
    airDb: clamp(reference.airDb - source.airDb),
  };
}

export function AudioMasteringTool() {
  const { t } = useI18n();
  const [targetLufs, setTargetLufs] = useState(-14);
  const [style, setStyle] = useState<MasterStyle>("balanced");
  const [referenceCurve, setReferenceCurve] = useState<MasterBandCurve | null>(null);
  const [referenceName, setReferenceName] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState(false);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  const hasReference = referenceCurve !== null;

  const onReferenceChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setReferenceError(false);
    if (file.size > MAX_BYTES) {
      setReferenceError(true);
      return;
    }
    try {
      const { buffer } = await decodeAudioFile(file);
      if (!buffer.length || !buffer.numberOfChannels) throw new Error("Empty reference.");
      setReferenceCurve(analyzeBandCurve(buffer));
      setReferenceName(file.name);
    } catch {
      setReferenceCurve(null);
      setReferenceName(null);
      setReferenceError(true);
    }
  };

  const removeReference = () => {
    setReferenceCurve(null);
    setReferenceName(null);
    setReferenceError(false);
  };

  return (
    <AudioEffectTool
      titleKey="audiomasteringtool.title"
      subtitleKey="audiomasteringtool.subtitle"
      maxBytes={MAX_BYTES}
      fileSuffix="-mastered"
      onProcess={(buffer) => {
        const curve = referenceCurve ? differenceCurve(referenceCurve, analyzeBandCurve(buffer)) : null;
        return renderMaster(buffer, { targetLufs, style, referenceCurve: curve });
      }}
    >
      {(busy) => (
        <>
          <fieldset className="quality-field">
            <legend>{t("audiomasteringtool.targetLabel")}</legend>
            <div className="quality-options">
              <button
                type="button"
                className={`quality-button${targetLufs === -14 ? " active" : ""}`}
                disabled={busy}
                onClick={() => setTargetLufs(-14)}
              >
                <strong>{t("audiomasteringtool.targetStreaming")}</strong>
              </button>
              <button
                type="button"
                className={`quality-button${targetLufs === -9 ? " active" : ""}`}
                disabled={busy}
                onClick={() => setTargetLufs(-9)}
              >
                <strong>{t("audiomasteringtool.targetLoud")}</strong>
              </button>
            </div>
          </fieldset>

          <fieldset className="quality-field" aria-disabled={hasReference}>
            <legend>{t("audiomasteringtool.styleLabel")}</legend>
            <div className="quality-options" style={hasReference ? { opacity: 0.5 } : undefined}>
              {STYLES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`quality-button${style === option && !hasReference ? " active" : ""}`}
                  disabled={busy || hasReference}
                  onClick={() => setStyle(option)}
                >
                  <strong>{t(STYLE_LABELS[option])}</strong>
                </button>
              ))}
            </div>
            {hasReference ? <p className="tool-note">{t("audiomasteringtool.referenceOverrides")}</p> : null}
          </fieldset>

          <label className="field-label">
            {t("audiomasteringtool.referenceLabel")}
            <input
              ref={referenceInputRef}
              type="file"
              accept={REFERENCE_ACCEPT}
              disabled={busy}
              onChange={onReferenceChange}
            />
          </label>
          {referenceName ? (
            <p className="imgtool-single-result">
              {t("audiomasteringtool.referenceLoaded")}: {referenceName}{" "}
              <button type="button" className="secondary-button" disabled={busy} onClick={removeReference}>
                {t("audiomasteringtool.referenceRemove")}
              </button>
            </p>
          ) : (
            <p className="tool-note">{t("audiomasteringtool.referenceHint")}</p>
          )}
          {referenceError ? <p className="tool-note">{t("audiomasteringtool.referenceError")}</p> : null}

          <p className="tool-note">{t("audiomasteringtool.note")}</p>
        </>
      )}
    </AudioEffectTool>
  );
}
