"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { downloadBlob } from "@/lib/audio/mp3-encoder";
import { formatBytes } from "@/lib/files/image";
import {
  HEIC_MAX_BYTES,
  HEIC_MAX_FILES,
  HeicDecodeError,
  HeicTooLargeError,
  convertHeic,
  heicOutputName,
  looksLikeHeic,
  type HeicOutputFormat,
} from "@/lib/files/heic";
import { FileDrop } from "./FileDrop";

type Status = { title: string; message: string; tone: "neutral" | "success" | "warning" };
type ResultRow = { name: string; blob: Blob; beforeBytes: number; note: string };

// MIME is unreliable for HEIC (many browsers/OSes report "" or
// application/octet-stream), so the input accepts by extension too; the drop
// handler double-checks with looksLikeHeic() before decoding.
const ACCEPT = ".heic,.heif,image/heic,image/heif";
const HEIC_NAME_RE = /\.hei[cf]$/i;

export function HeicTool() {
  const { t } = useI18n();
  const [format, setFormat] = useState<HeicOutputFormat>("jpeg");
  const [quality, setQuality] = useState(0.9);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);

  const formatOptions = useMemo(
    () => [
      { value: "jpeg" as const, label: "JPG" },
      { value: "png" as const, label: "PNG" },
    ],
    [],
  );

  const process = async (files: File[]) => {
    const picked = files.slice(0, HEIC_MAX_FILES);
    if (!picked.length) return;
    setWorking(true);
    setResults([]);
    setStatus({ title: t("files.processing"), message: picked[0].name, tone: "neutral" });

    const out: ResultRow[] = [];
    let failed = 0;
    let skipped = 0;

    for (const file of picked) {
      const plausible = HEIC_NAME_RE.test(file.name) || /^image\/hei[cf]$/i.test(file.type);
      if (!plausible && !(await looksLikeHeic(file))) {
        skipped += 1;
        continue;
      }
      try {
        const result = await convertHeic(file, format, quality);
        out.push({
          name: heicOutputName(file.name, format),
          blob: result.blob,
          beforeBytes: file.size,
          note: `${result.width}×${result.height}`,
        });
      } catch (error) {
        failed += 1;
        const key =
          error instanceof HeicTooLargeError
            ? "files.tooLarge"
            : error instanceof HeicDecodeError
              ? "heictool.decodeFailed"
              : "files.failed";
        setStatus({ title: t(key), message: file.name, tone: "warning" });
      }
    }

    setResults(out);
    setWorking(false);
    if (out.length) {
      setStatus({
        title: t("files.done"),
        message: failed || skipped ? t("files.someFailed", { count: failed + skipped }) : `${out.length}`,
        tone: failed || skipped ? "warning" : "success",
      });
      if (out.length === 1) downloadBlob(out[0].blob, out[0].name);
    } else if (!failed) {
      setStatus(skipped ? { title: t("heictool.notHeic"), message: picked[0].name, tone: "warning" } : null);
    }
  };

  return (
    <article className="panel hero-tool">
      <div className="panel-heading hero-heading">
        <div>
          <h1>{t("heictool.title")}</h1>
          <p>{t("heictool.subtitle")}</p>
        </div>
      </div>

      <article className="utility-card">
        <fieldset className="quality-field">
          <legend>{t("imgtool.formatOut")}</legend>
          <div className="quality-options format-options">
            {formatOptions.map((option) => (
              <button
                key={option.value}
                className={`quality-button${format === option.value ? " active" : ""}`}
                type="button"
                disabled={working}
                onClick={() => setFormat(option.value)}
              >
                <strong>{option.label}</strong>
              </button>
            ))}
          </div>
        </fieldset>

        {format === "jpeg" ? (
          <label className="field-label imgtool-quality">
            {t("imgtool.quality")} ({Math.round(quality * 100)}%)
            <input
              type="range"
              min={30}
              max={95}
              value={Math.round(quality * 100)}
              disabled={working}
              onChange={(event) => setQuality(Number(event.target.value) / 100)}
            />
          </label>
        ) : null}

        <FileDrop
          accept={ACCEPT}
          multiple
          disabled={working}
          onFiles={process}
          hint={t("heictool.drop", { max: HEIC_MAX_FILES, size: formatBytes(HEIC_MAX_BYTES) })}
        />

        {results.length > 1 ? (
          <ul className="imgtool-results">
            {results.map((row) => (
              <li key={row.name}>
                <span className="imgtool-result-name">{row.name}</span>
                <span className="imgtool-result-meta">
                  {formatBytes(row.beforeBytes)} → {formatBytes(row.blob.size)} · {row.note}
                </span>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => downloadBlob(row.blob, row.name)}
                >
                  {t("files.download")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {results.length === 1 ? (
          <p className="imgtool-single-result">
            {results[0].name}: {formatBytes(results[0].beforeBytes)} → {formatBytes(results[0].blob.size)} ·{" "}
            {results[0].note}{" "}
            <button
              className="secondary-button"
              type="button"
              onClick={() => downloadBlob(results[0].blob, results[0].name)}
            >
              {t("files.downloadAgain")}
            </button>
          </p>
        ) : null}
      </article>

      <div className="status-box" data-tone={(status ?? { tone: "neutral" }).tone} role="status">
        <strong>{status ? status.title : t("files.idle")}</strong>
        <span>{status ? status.message : t("files.localNote")}</span>
      </div>

      {/* heic-to attribution: LGPL-3.0 build of libheif, unmodified, from
          https://github.com/hoppergee/heic-to */}
      <p className="vidtool-attribution">
        Powered by <a href="https://github.com/hoppergee/heic-to" rel="noopener noreferrer" target="_blank">heic-to</a>
      </p>
    </article>
  );
}
