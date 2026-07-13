"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n/locales/en";
import { downloadBlob, encodeMp3FromChannels, encodeWavFromChannels } from "@/lib/audio/mp3-encoder";
import { decodeAudioFile } from "@/lib/audio/decode";
import { renderJoin } from "@/lib/audio/audio-joiner";
import { formatBytes } from "@/lib/files/image";
import { FileDrop } from "./FileDrop";
import { AudioFormatPicker, type AudioOutputFormat } from "./AudioFormatPicker";

type Status = { title: string; message: string; tone: "neutral" | "success" | "warning" };
type QueuedFile = { id: string; file: File };
type Transition = "none" | "crossfade" | "gap";

const MAX_BYTES = 200 * 1024 * 1024;
const MAX_FILES = 12;
const ACCEPT = "audio/*,.mp3,.wav,.flac,.ogg,.oga,.m4a,.aac,.opus,.wma,.aiff,.aif,.weba";

const TRANSITION_LABELS: Record<Transition, DictKey> = {
  none: "joinertool.transitionNone",
  crossfade: "joinertool.transitionCrossfade",
  gap: "joinertool.transitionGap",
};

let uidCounter = 0;
function nextId(): string {
  uidCounter += 1;
  return `joiner-${uidCounter}`;
}

export function AudioJoinerTool() {
  const { t } = useI18n();
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [transition, setTransition] = useState<Transition>("none");
  const [format, setFormat] = useState<AudioOutputFormat>("mp3");
  const [mp3Kbps, setMp3Kbps] = useState(320);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [result, setResult] = useState<{ name: string; blob: Blob } | null>(null);

  const busy = working;

  const addFiles = (files: File[]) => {
    const accepted = files.filter((file) => file.size <= MAX_BYTES);
    if (accepted.length < files.length) {
      setStatus({ title: t("files.tooLarge"), message: formatBytes(MAX_BYTES), tone: "warning" });
    }
    setQueue((prev) => [...prev, ...accepted.map((file) => ({ id: nextId(), file }))].slice(0, MAX_FILES));
  };

  const move = (index: number, direction: -1 | 1) => {
    setQueue((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeAt = (index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  };

  const join = async () => {
    if (queue.length < 2) return;
    setWorking(true);
    setResult(null);
    setStatus({ title: t("files.processing"), message: `${queue.length}`, tone: "neutral" });

    try {
      const buffers: AudioBuffer[] = [];
      let failed = 0;
      for (const item of queue) {
        try {
          const { buffer } = await decodeAudioFile(item.file);
          if (buffer.length && buffer.numberOfChannels) buffers.push(buffer);
          else failed += 1;
        } catch {
          failed += 1;
        }
      }
      if (buffers.length < 2) throw new Error("Not enough valid audio files.");

      const { channels, sampleRate } = await renderJoin(buffers, {
        crossfadeSeconds: transition === "crossfade" ? 0.3 : 0,
        gapSeconds: transition === "gap" ? 1 : 0,
      });
      if (!channels.length || !channels[0]?.length) throw new Error("Empty output.");

      const blob =
        format === "mp3"
          ? await encodeMp3FromChannels(channels, sampleRate, mp3Kbps)
          : encodeWavFromChannels(channels, sampleRate);
      const name = `joined-audio.${format}`;
      setResult({ name, blob });
      setStatus({
        title: t("files.done"),
        message: failed ? t("files.someFailed", { count: failed }) : formatBytes(blob.size),
        tone: failed ? "warning" : "success",
      });
      downloadBlob(blob, name);
    } catch {
      setStatus({ title: t("files.failed"), message: "", tone: "warning" });
    } finally {
      setWorking(false);
    }
  };

  return (
    <article className="panel hero-tool">
      <div className="panel-heading hero-heading">
        <div>
          <h1>{t("joinertool.title")}</h1>
          <p>{t("joinertool.subtitle")}</p>
        </div>
      </div>

      <article className="utility-card">
        <FileDrop
          accept={ACCEPT}
          multiple
          disabled={busy || queue.length >= MAX_FILES}
          onFiles={addFiles}
          hint={t("joinertool.dropFiles", { max: MAX_FILES, size: formatBytes(MAX_BYTES) })}
        />

        {queue.length ? (
          <ul className="imgtool-results">
            {queue.map((item, index) => (
              <li key={item.id}>
                <span className="imgtool-result-name">
                  {index + 1}. {item.file.name}
                </span>
                <span className="imgtool-result-meta">{formatBytes(item.file.size)}</span>
                <span className="joiner-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={t("joinertool.moveUp")}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy || index === queue.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={t("joinertool.moveDown")}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => removeAt(index)}
                    aria-label={t("common.remove")}
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <fieldset className="quality-field">
          <legend>{t("joinertool.transition")}</legend>
          <div className="quality-options">
            {(["none", "crossfade", "gap"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`quality-button${transition === option ? " active" : ""}`}
                disabled={busy}
                onClick={() => setTransition(option)}
              >
                <strong>{t(TRANSITION_LABELS[option])}</strong>
              </button>
            ))}
          </div>
        </fieldset>

        <AudioFormatPicker format={format} setFormat={setFormat} mp3Kbps={mp3Kbps} setMp3Kbps={setMp3Kbps} disabled={busy} />

        <button type="button" className="primary-button" disabled={busy || queue.length < 2} onClick={join}>
          {busy ? t("files.processing") : t("joinertool.join", { count: queue.length })}
        </button>

        {result ? (
          <p className="imgtool-single-result">
            {result.name}: {formatBytes(result.blob.size)}{" "}
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
    </article>
  );
}
