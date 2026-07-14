"use client";

// "Recently analyzed" community results. Rendered at the BOTTOM of the
// analyzer panel so its late arrival never shifts above-the-fold layout
// (it cost us CLS when it lived next to the link input). Picking a song
// notifies LinkAnalyze via a custom event.
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

export type RecentRow = {
  id: string;
  title: string;
  artist: string | null;
  bpm: number;
  key: string;
  camelot: string | null;
};

export const SHOW_SONG_EVENT = "tunebad:show-song";

export function RecentStrip() {
  const { t } = useI18n();
  const [recent, setRecent] = useState<RecentRow[]>([]);

  useEffect(() => {
    void fetch("/api/recent")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { recent?: RecentRow[] } | null) => {
        if (data?.recent?.length) setRecent(data.recent);
      })
      .catch(() => {});
  }, []);

  if (!recent.length) return null;
  return (
    <div className="link-analyze-recent">
      <span className="link-analyze-label">{t("analysis.recentTitle")}</span>
      <ul>
        {recent.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className="link-analyze-recent-pill"
              onClick={() => {
                window.history.replaceState(null, "", `/key-bpm-finder?song=${encodeURIComponent(r.id)}`);
                window.dispatchEvent(new CustomEvent(SHOW_SONG_EVENT, { detail: r }));
                window.scrollTo({ top: 0, behavior: "auto" });
              }}
            >
              <span className="link-analyze-recent-title">
                {r.artist ? `${r.artist} - ` : ""}
                {r.title}
              </span>
              <span className="link-analyze-recent-stats">
                {Math.round(r.bpm)} BPM · {r.key}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
