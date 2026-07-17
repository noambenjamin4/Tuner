"use client";

import { useState, type FormEvent } from "react";
import { convertFileToMp3, convertFileToWav } from "@/lib/audio/mp3-encoder";
import { downloadBlob } from "@/lib/files/download";
import { formatFileSize } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { CheckRow } from "@/components/ui/CheckRow";
import { FilePicker } from "@/components/ui/FilePicker";
import { QualityPicker, FormatPicker, type Quality, type OutputFormat } from "./QualityPicker";

type Status = { title: string; message: string; tone: "neutral" | "success" | "warning" };

export function LocalFileConverter() {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState<Quality>("320");
  const [format, setFormat] = useState<OutputFormat>("mp3");
  const [trimSilence, setTrimSilence] = useState(true);
  const [working, setWorking] = useState(false);
  // null = idle; the idle status is derived at render time so it follows the active locale.
  const [status, setStatus] = useState<Status | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      setStatus({ title: t("localConverter.needFileTitle"), message: t("localConverter.needFileMessage"), tone: "warning" });
      return;
    }
    setWorking(true);
    setStatus({
      title: t("ytDownloader.converting"),
      message:
        format === "wav"
          ? t("localConverter.convertingWav", { name: file.name })
          : t("localConverter.convertingMp3", { name: file.name, kbps: quality }),
      tone: "neutral",
    });
    try {
      const baseName = file.name.replace(/\.[^.]+$/, "") || "tunebad-audio";
      let blob: Blob;
      if (format === "wav") {
        blob = await convertFileToWav(file, trimSilence);
        downloadBlob(blob, `${baseName}-tunebad.wav`);
      } else {
        const kbps = Number.parseInt(quality, 10);
        blob = await convertFileToMp3(file, kbps, trimSilence);
        downloadBlob(blob, `${baseName}-${kbps}kbps.mp3`);
      }
      setStatus({
        title: t("localConverter.createdTitle", { format: format.toUpperCase() }),
        message: t("localConverter.createdMessage", {
          sourceSize: formatFileSize(file.size),
          outputSize: formatFileSize(blob.size),
        }),
        tone: "success",
      });
    } catch (error) {
      console.error(error);
      setStatus({
        title: t("localConverter.failedTitle"),
        // Never surface the raw exception: it is hardcoded English (decode.ts,
        // mp3-encoder.ts) or a browser-native DOMException, both untranslated
        // in the 7 non-English locales. The real error is logged above.
        message: t("localConverter.failedFallback"),
        tone: "warning",
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <article className="utility-card converter-card">
      <div className="tool-heading">
        <div>
          <h3>{t("localConverter.title")}</h3>
          <p>{t("localConverter.subtitle")}</p>
        </div>
      </div>

      <form className="converter-form" onSubmit={(event) => void onSubmit(event)}>
        <span className="field-label">{t("converter.audioFile")}</span>
        <FilePicker file={file} onFile={setFile} accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac" disabled={working} />
        <FormatPicker value={format} onChange={setFormat} />
        {format === "mp3" ? <QualityPicker value={quality} onChange={setQuality} /> : null}
        <CheckRow checked={trimSilence} onChange={setTrimSilence} disabled={working}>
          {t("converter.autoTrim")}
        </CheckRow>
        <button className="convert-button" type="submit" disabled={working || !file}>
          {working ? t("converter.working") : t("converter.convertTo", { format: format.toUpperCase() })}
        </button>
      </form>

      <div className="status-box" data-tone={(status ?? { tone: "neutral" }).tone} role="status">
        <strong>{status ? status.title : t("localConverter.idleTitle")}</strong>
        <span>{status ? status.message : t("localConverter.idleMessage")}</span>
      </div>
    </article>
  );
}
