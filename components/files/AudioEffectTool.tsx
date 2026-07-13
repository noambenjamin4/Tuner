"use client";

import { useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n/locales/en";
import { downloadBlob, encodeMp3FromChannels, encodeWavFromChannels } from "@/lib/audio/mp3-encoder";
import { decodeAudioFile } from "@/lib/audio/decode";
import { formatBytes } from "@/lib/files/image";
import { FileDrop } from "./FileDrop";
import { AudioFormatPicker, type AudioOutputFormat } from "./AudioFormatPicker";

// Shared single-file skeleton for the in-browser audio effect tools
// (nightcore, bass booster, 8D audio): drop one file, decode it, hand the
// AudioBuffer to the caller's `onProcess` (the tool-specific DSP from
// lib/audio/*), then encode + download the result. Keeps the four new tools
// DRY without forcing them all through one giant component — the
// multi-file audio joiner has its own shape and lives in AudioJoinerTool.tsx.

type Status = { title: string; message: string; tone: "neutral" | "success" | "warning" };
export type AudioEffectResult = { channels: Float32Array[]; sampleRate: number };

const ACCEPT = "audio/*,.mp3,.wav,.flac,.ogg,.oga,.m4a,.aac,.opus,.wma,.aiff,.aif,.weba";

export function AudioEffectTool({
  titleKey,
  subtitleKey,
  maxBytes,
  fileSuffix,
  onProcess,
  children,
  attribution,
}: {
  titleKey: DictKey;
  subtitleKey: DictKey;
  maxBytes: number;
  fileSuffix: string;
  onProcess: (buffer: AudioBuffer) => Promise<AudioEffectResult>;
  children?: (busy: boolean) => ReactNode;
  attribution?: ReactNode;
}) {
  const { t } = useI18n();
  const [format, setFormat] = useState<AudioOutputFormat>("mp3");
  const [mp3Kbps, setMp3Kbps] = useState(320);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [result, setResult] = useState<{ name: string; blob: Blob; beforeBytes: number } | null>(null);

  const busy = working;

  const process = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (file.size > maxBytes) {
      setStatus({ title: t("files.tooLarge"), message: formatBytes(maxBytes), tone: "warning" });
      return;
    }

    setWorking(true);
    setResult(null);
    setStatus({ title: t("files.processing"), message: file.name, tone: "neutral" });

    try {
      const { buffer } = await decodeAudioFile(file);
      if (!buffer.length || !buffer.numberOfChannels) throw new Error("Empty audio buffer.");

      const { channels, sampleRate } = await onProcess(buffer);
      if (!channels.length || !channels[0]?.length) throw new Error("Empty output.");

      const blob =
        format === "mp3"
          ? await encodeMp3FromChannels(channels, sampleRate, mp3Kbps)
          : encodeWavFromChannels(channels, sampleRate);

      const base = file.name.replace(/\.[^./\\]+$/, "");
      const name = `${base}${fileSuffix}.${format}`;
      setResult({ name, blob, beforeBytes: file.size });
      setStatus({ title: t("files.done"), message: formatBytes(blob.size), tone: "success" });
      downloadBlob(blob, name);
    } catch {
      setStatus({ title: t("files.failed"), message: file.name, tone: "warning" });
    } finally {
      setWorking(false);
    }
  };

  return (
    <article className="panel hero-tool">
      <div className="panel-heading hero-heading">
        <div>
          <h1>{t(titleKey)}</h1>
          <p>{t(subtitleKey)}</p>
        </div>
      </div>

      <article className="utility-card">
        {children ? children(busy) : null}

        <AudioFormatPicker format={format} setFormat={setFormat} mp3Kbps={mp3Kbps} setMp3Kbps={setMp3Kbps} disabled={busy} />

        <FileDrop
          accept={ACCEPT}
          disabled={busy}
          onFiles={process}
          hint={t("mediatool.dropAudio", { size: formatBytes(maxBytes) })}
        />

        {result ? (
          <p className="imgtool-single-result">
            {result.name}: {formatBytes(result.beforeBytes)} → {formatBytes(result.blob.size)}{" "}
            <button className="secondary-button" type="button" onClick={() => downloadBlob(result.blob, result.name)}>
              {t("files.downloadAgain")}
            </button>
          </p>
        ) : null}
      </article>

      <div className="status-box" data-tone={(status ?? { tone: "neutral" }).tone} role="status">
        <strong>{status ? status.title : t("files.idle")}</strong>
        <span>{status ? status.message : t("files.localNote")}</span>
      </div>

      {attribution}
    </article>
  );
}
