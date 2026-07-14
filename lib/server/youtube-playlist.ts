// Shared YouTube playlist tracklist fetcher — extracted so both the
// converter's enumerate-then-download flow (app/api/youtube/playlist/route.ts)
// and the playlist analyzer (app/api/playlist-lookup/route.ts) hit the same
// backend-pick / yt-dlp fallback logic instead of drifting apart.
//
// Returns the raw { id, title } shape unchanged (same as the underlying
// enumeratePlaylist/PlaylistItem) — the converter needs the video `id` intact
// to build download URLs, so title/artist splitting is left to each caller.
import { pickBackend } from "@/lib/server/backends";
import { enumeratePlaylist } from "@/lib/server/ytdlp";
import { homeDownloaderUrl, homeDownloaderKey, remoteDownloaderUrl, remoteDownloaderKey } from "@/lib/runtime";
import en from "@/lib/i18n/locales/en";

export interface YouTubeTracklistItem {
  id: string;
  title: string | null;
}

export type YouTubeTracklistResult =
  | { ok: true; items: YouTubeTracklistItem[] }
  | { ok: false; status: number; error: string };

/** Fetches a YouTube playlist's entries, proxying to the home/remote
 *  downloader backend when configured (preferred — avoids the datacenter IP
 *  bot-wall), falling back to a local yt-dlp shell-out otherwise. Caller is
 *  responsible for the isDownloaderEnabled feature-flag gate and for
 *  validating/canonicalizing the URL first. */
export async function fetchYouTubeTracklist(canonicalPlaylistUrl: string): Promise<YouTubeTracklistResult> {
  const homeConfigured = Boolean(homeDownloaderUrl && homeDownloaderKey);
  const remoteConfigured = Boolean(remoteDownloaderUrl && remoteDownloaderKey);

  if (homeConfigured || remoteConfigured) {
    const pick = await pickBackend();
    if (pick.status === "none") return { ok: false, status: 502, error: "Could not read that playlist." };
    // Remote is cold-starting (~50s) — reading the playlist would time out and
    // read as a generic failure. pickBackend's health check started the
    // spin-up; tell the caller to retry into a warm server.
    if (pick.status === "waking") return { ok: false, status: 503, error: en["ytDownloader.serverWaking"] };
    const backend = pick.backend;

    try {
      const upstream = await fetch(`${backend.base}/playlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": backend.key },
        body: JSON.stringify({ url: canonicalPlaylistUrl }),
      });
      const payload = (await upstream.json().catch(() => ({}))) as { items?: YouTubeTracklistItem[]; error?: string };
      if (!upstream.ok) {
        return { ok: false, status: upstream.status, error: payload.error || "Could not read that playlist." };
      }
      return { ok: true, items: Array.isArray(payload.items) ? payload.items : [] };
    } catch (error) {
      console.error(`Failed to reach ${backend.tag} downloader`, error);
      return { ok: false, status: 502, error: "Could not read that playlist." };
    }
  }

  try {
    const items = await enumeratePlaylist(canonicalPlaylistUrl);
    return { ok: true, items };
  } catch (error) {
    console.error("Failed to enumerate playlist", error);
    return { ok: false, status: 502, error: "Could not read that playlist." };
  }
}
