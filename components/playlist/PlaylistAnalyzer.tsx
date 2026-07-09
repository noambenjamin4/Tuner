"use client";

// Paste a Spotify or YouTube playlist link, get every track's key, BPM, and
// Camelot code. Cache hits render instantly from the shared community DB;
// the rest are analyzed right here in the browser (see usePlaylistAnalyzer)
// and written back, so the DB keeps growing. The download bridge is never
// involved — this is Deezer preview search + client-side essentia only.
import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { usePlaylistAnalyzer, type PlaylistTrackInput } from "@/hooks/usePlaylistAnalyzer";

type Phase = "idle" | "looking" | "ready";
type ErrorKey = "playlist.rateLimited" | "playlist.invalidLink" | "playlist.notFound" | "playlist.error";

const CAMELOT_ORDER: string[] = [
  ...Array.from({ length: 12 }, (_, i) => `${i + 1}A`),
  ...Array.from({ length: 12 }, (_, i) => `${i + 1}B`),
];

function exportPlaylistCsv(
  rows: { title: string; artist: string | null; keyName: string | null; camelot: string | null; bpm: number | null; energy: number | null }[],
): void {
  const header = ["#", "Title", "Artist", "Key", "Camelot", "BPM", "Energy"];
  const csvRows = rows.map((row, index) => [
    String(index + 1),
    row.title,
    row.artist || "",
    row.keyName || "",
    row.camelot || "",
    row.bpm ? String(Math.round(row.bpm)) : "",
    row.energy == null ? "" : String(Math.round(row.energy)),
  ]);
  const csv = [header, ...csvRows]
    .map((r) => r.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "tunebad-playlist-analysis.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function PlaylistAnalyzer() {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const [tracks, setTracks] = useState<PlaylistTrackInput[] | null>(null);
  const [sortByCamelot, setSortByCamelot] = useState(false);

  const { rows, totalCount, analyzedCount, cachedCount, busy } = usePlaylistAnalyzer(tracks);

  const shownRows = useMemo(() => {
    if (!sortByCamelot) return rows;
    return [...rows].sort((a, b) => {
      const ai = a.camelot ? CAMELOT_ORDER.indexOf(a.camelot) : 999;
      const bi = b.camelot ? CAMELOT_ORDER.indexOf(b.camelot) : 999;
      return ai - bi;
    });
  }, [rows, sortByCamelot]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || phase === "looking") return;
    setErrorKey(null);
    setTracks(null);
    setPhase("looking");
    try {
      const res = await fetch(`/api/playlist-lookup?url=${encodeURIComponent(trimmed)}`);
      if (res.status === 429) {
        setErrorKey("playlist.rateLimited");
        return;
      }
      if (res.status === 400) {
        setErrorKey("playlist.invalidLink");
        return;
      }
      if (res.status === 404) {
        setErrorKey("playlist.notFound");
        return;
      }
      if (!res.ok) {
        setErrorKey("playlist.error");
        return;
      }
      const data = (await res.json()) as { tracks?: PlaylistTrackInput[] };
      if (!data.tracks || data.tracks.length === 0) {
        setErrorKey("playlist.notFound");
        return;
      }
      setTracks(data.tracks);
    } catch {
      setErrorKey("playlist.error");
    } finally {
      setPhase("ready");
    }
  };

  const hasRows = rows.length > 0;
  const hasUnmatched = rows.some((r) => r.status === "notfound" || r.status === "failed");

  return (
    <div className="pa-tool">
      <form className="pa-form" onSubmit={onSubmit}>
        <label className="pa-form-label" htmlFor="pa-url-input">
          {t("playlist.inputLabel")}
        </label>
        <div className="pa-form-row">
          <input
            id="pa-url-input"
            type="url"
            placeholder={t("playlist.placeholder")}
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setErrorKey(null);
            }}
            disabled={phase === "looking"}
          />
          <button className="secondary-button" type="submit" disabled={phase === "looking" || !url.trim()}>
            {phase === "looking" ? t("playlist.looking") : t("playlist.button")}
          </button>
        </div>
        {!hasRows && !errorKey ? <p className="pa-hint">{t("playlist.idleHint")}</p> : null}
        {errorKey ? <p className="pa-hint pa-error">{t(errorKey)}</p> : null}
      </form>

      {hasRows ? (
        <>
          <div className="pa-progress-row">
            <p className="pa-progress">
              {t("playlist.progressLine", { done: analyzedCount, total: totalCount, cached: cachedCount })}
              {busy ? <span className="pa-spinner" aria-hidden="true" /> : null}
            </p>
            <div className="pa-actions">
              <button
                className="text-button"
                type="button"
                onClick={() => setSortByCamelot((v) => !v)}
                aria-pressed={sortByCamelot}
              >
                {t("playlist.sortCamelot")}
              </button>
              <button className="text-button" type="button" onClick={() => exportPlaylistCsv(shownRows)}>
                {t("analysis.exportCsv")}
              </button>
            </div>
          </div>

          {hasUnmatched ? <p className="pa-hint pa-partial-note">{t("playlist.partialNote")}</p> : null}

          <div className="table-wrap pa-table-wrap">
            <table className="pa-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("playlist.colTitle")}</th>
                  <th>{t("playlist.colArtist")}</th>
                  <th>{t("table.key")}</th>
                  <th>{t("table.camelot")}</th>
                  <th>{t("table.bpm")}</th>
                  <th>{t("stat.energy")}</th>
                </tr>
              </thead>
              <tbody>
                {shownRows.map((row, index) => {
                  const unresolved = row.status === "notfound" || row.status === "failed";
                  return (
                    <tr key={row.rowKey} className={unresolved ? "pa-row-unresolved" : undefined}>
                      <td>{index + 1}</td>
                      <td className="pa-title-cell">
                        {row.slug ? (
                          <Link href={`/song/${row.slug}`}>{row.title}</Link>
                        ) : (
                          row.title
                        )}
                      </td>
                      <td className="pa-muted-cell">{row.artist || ""}</td>
                      {unresolved ? (
                        <td colSpan={4} className="pa-muted-cell">
                          {row.status === "analyzing" ? t("playlist.statusAnalyzing") : t("playlist.rowUnavailable")}
                        </td>
                      ) : (
                        <>
                          <td>{row.status === "analyzing" ? t("playlist.statusAnalyzing") : row.keyName || ""}</td>
                          <td className="pa-accent">{row.camelot || ""}</td>
                          <td>
                            {row.bpm ? Math.round(row.bpm) : ""}
                            {row.bpmAlt ? ` / ${Math.round(row.bpmAlt)}` : ""}
                          </td>
                          <td>{row.energy == null ? "" : Math.round(row.energy)}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
