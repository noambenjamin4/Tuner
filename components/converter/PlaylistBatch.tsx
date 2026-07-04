"use client";

import { useI18n } from "@/lib/i18n";
import { usePlaylistBatch, type PlaylistItem } from "@/hooks/usePlaylistBatch";

export function PlaylistBatch({
  items,
  format,
  quality,
}: {
  items: PlaylistItem[];
  format: string;
  quality: string;
}) {
  const { t } = useI18n();
  const { rows, doneCount, failedCount, total } = usePlaylistBatch(items, { format, quality });

  return (
    <div className="playlist-batch">
      <div className="playlist-batch-header">
        <strong>{t("ytDownloader.batchSummary", { total, done: doneCount, failed: failedCount })}</strong>
        <span>{t("ytDownloader.playlistProgress", { done: doneCount, total })}</span>
      </div>
      <ol className="playlist-batch-list">
        {rows.map((row, index) => (
          <li key={row.id} className="playlist-batch-row">
            <span className="playlist-batch-index">{index + 1}</span>
            <span className="playlist-batch-title">{row.title || `Track ${index + 1}`}</span>
            <span className="playlist-batch-status">
              {row.phase === "queued" ? null : row.phase === "working" ? (
                <span className="progress-track" aria-hidden="true">
                  <span className="progress-fill" style={{ width: `${Math.max(2, row.progress)}%` }}></span>
                </span>
              ) : row.phase === "done" ? (
                <a className="download-ready-link" href={`/api/youtube/${row.jobId}/file`}>
                  {t("ytDownloader.downloadFormat", { format: format.toUpperCase() })}
                </a>
              ) : (
                <span className="playlist-batch-error">{row.error || t("ytDownloader.playlistItemFailed")}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
