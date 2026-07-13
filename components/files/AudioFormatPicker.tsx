"use client";

import { useI18n } from "@/lib/i18n";

// Shared MP3/WAV + bitrate picker for the audio effect tools (nightcore,
// bass booster, 8D, joiner) — same visual language as ImageFormatPicker in
// ImageTool.tsx, kept as its own component so the 4 tools don't duplicate it.
export type AudioOutputFormat = "mp3" | "wav";

const MP3_BITRATES = [128, 192, 320] as const;

export function AudioFormatPicker({
  format,
  setFormat,
  mp3Kbps,
  setMp3Kbps,
  disabled,
}: {
  format: AudioOutputFormat;
  setFormat: (format: AudioOutputFormat) => void;
  mp3Kbps: number;
  setMp3Kbps: (kbps: number) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      <fieldset className="quality-field">
        <legend>{t("imgtool.formatOut")}</legend>
        <div className="quality-options format-options">
          {(["mp3", "wav"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`quality-button${format === option ? " active" : ""}`}
              disabled={disabled}
              onClick={() => setFormat(option)}
            >
              <strong>{option.toUpperCase()}</strong>
            </button>
          ))}
        </div>
      </fieldset>

      {format === "mp3" ? (
        <fieldset className="quality-field">
          <legend>{t("mediatool.bitrate")}</legend>
          <div className="quality-options">
            {MP3_BITRATES.map((kbps) => (
              <button
                key={kbps}
                type="button"
                className={`quality-button${mp3Kbps === kbps ? " active" : ""}`}
                disabled={disabled}
                onClick={() => setMp3Kbps(kbps)}
              >
                <strong>{kbps}</strong>
                <span>kbps</span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
    </>
  );
}
