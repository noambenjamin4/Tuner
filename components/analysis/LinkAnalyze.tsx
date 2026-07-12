"use client";

// "Type a song name or paste a link, get key & BPM" — the zero-infrastructure
// flow: cached community result if anyone analyzed this song before, otherwise
// the song's official 30s catalog preview is fetched (via our allowlisted
// proxy) and analyzed right here in the browser. Free-text input is resolved
// to the top Deezer catalog match server-side. The download bridge is never
// involved.
import { FormEvent, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { canonicalYouTubeUrl, validateSpotifyUrl, validateMediaUrl } from "@/lib/media-url";

export type LinkPreviewMeta = {
  id: string;
  title: string;
  artist: string | null;
  fileName: string;
};

type CachedRow = {
  id: string;
  title: string;
  artist: string | null;
  bpm: number;
  bpm_alt: number | null;
  key: string;
  camelot: string | null;
};

type Phase = "idle" | "looking" | "fetching";

/** Make a link result shareable: /key-bpm-finder?song=<id>. */
function permalinkFor(id: string): string {
  return `${window.location.origin}/key-bpm-finder?song=${encodeURIComponent(id)}`;
}

/** True when the input parses as a link to a platform the link flow supports. */
function isSupportedTrackUrl(input: string): boolean {
  return Boolean(canonicalYouTubeUrl(input) || validateSpotifyUrl(input) || validateMediaUrl(input));
}

/** True when the input is clearly meant to be a URL (so a typo'd or
 *  unsupported link errors honestly instead of being searched as text). */
function looksLikeUrl(input: string): boolean {
  return /^(https?:\/\/|www\.|spotify:)/i.test(input) || input.includes("://");
}

export function LinkAnalyze({ onPreviewFile }: { onPreviewFile: (file: File, meta: LinkPreviewMeta) => void }) {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [cached, setCached] = useState<CachedRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // The resolved "Title — Artist" being analyzed, so the user always sees
  // which catalog match a free-text search (or link) landed on.
  const [match, setMatch] = useState<{ title: string; artist: string | null } | null>(null);

  const busy = phase !== "idle";

  // Shared permalinks (?song=<id>) resolve straight from the community cache;
  // picks from the RecentStrip arrive via a custom event.
  useEffect(() => {
    const song = new URLSearchParams(window.location.search).get("song");
    if (song) {
      void fetch(`/api/lookup?id=${encodeURIComponent(song)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { cached?: CachedRow } | null) => {
          if (data?.cached) setCached(data.cached);
        })
        .catch(() => {});
    }
    const onShowSong = (e: Event) => {
      const row = (e as CustomEvent<CachedRow>).detail;
      if (row?.id) setCached({ ...row, bpm_alt: row.bpm_alt ?? null });
    };
    window.addEventListener("tunebad:show-song", onShowSong);
    return () => window.removeEventListener("tunebad:show-song", onShowSong);
  }, []);

  const copyPermalink = (id: string) => {
    void navigator.clipboard
      ?.writeText(permalinkFor(id))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || busy) return;
    setCached(null);
    setError(null);
    setMatch(null);

    // Route: supported link → link lookup; something that was clearly meant
    // to be a URL but isn't supported → honest error; anything else → treat
    // it as a song-name search.
    const isUrl = isSupportedTrackUrl(trimmed);
    if (!isUrl && looksLikeUrl(trimmed)) {
      setError(t("analysis.linkInvalid"));
      return;
    }
    if (!isUrl && trimmed.length < 2) {
      setError(t("analysis.searchInvalid"));
      return;
    }

    setPhase("looking");
    try {
      const lookupRes = await fetch(
        isUrl
          ? `/api/lookup?url=${encodeURIComponent(trimmed)}`
          : `/api/lookup?q=${encodeURIComponent(trimmed)}`,
      );
      if (lookupRes.status === 429) {
        setError(t("analysis.linkRateLimited"));
        return;
      }
      if (lookupRes.status === 400) {
        setError(isUrl ? t("analysis.linkInvalid") : t("analysis.searchInvalid"));
        return;
      }
      if (lookupRes.status === 404) {
        setError(t("analysis.linkNotFound"));
        return;
      }
      if (!lookupRes.ok) {
        setError(t("analysis.linkError"));
        return;
      }
      const data = (await lookupRes.json()) as
        | { cached: CachedRow }
        | { sourceId: string; title: string; artist: string; previewUrl: string };

      if ("cached" in data) {
        setCached(data.cached);
        return;
      }

      setPhase("fetching");
      setMatch({ title: data.title, artist: data.artist || null });
      const previewRes = await fetch(`/api/preview?src=${encodeURIComponent(data.previewUrl)}`);
      if (!previewRes.ok) {
        setError(t("analysis.linkError"));
        return;
      }
      const blob = await previewRes.blob();
      const fileName = `${data.artist ? `${data.artist} - ` : ""}${data.title} (preview).mp3`;
      const file = new File([blob], fileName, { type: blob.type || "audio/mpeg" });
      onPreviewFile(file, { id: data.sourceId, title: data.title, artist: data.artist || null, fileName });
      // Make the URL shareable right away (once analyzed, the permalink
      // resolves from the community cache).
      window.history.replaceState(null, "", `/key-bpm-finder?song=${encodeURIComponent(data.sourceId)}`);
    } catch {
      setError(t("analysis.linkError"));
    } finally {
      setPhase("idle");
    }
  };

  return (
    <div className="link-analyze">
      <form className="link-analyze-form" onSubmit={onSubmit}>
        <label className="link-analyze-label" htmlFor="link-analyze-input">
          {t("analysis.linkLabel")}
        </label>
        <div className="link-analyze-row">
          <input
            id="link-analyze-input"
            type="text"
            placeholder={t("analysis.linkPlaceholder")}
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setError(null);
            }}
            disabled={busy}
          />
          <button className="secondary-button" type="submit" disabled={busy || !url.trim()}>
            {phase === "looking"
              ? t("analysis.linkLooking")
              : phase === "fetching"
                ? t("analysis.linkFetching")
                : t("analysis.linkButton")}
          </button>
        </div>
      </form>

      {error ? <p className="link-analyze-note link-analyze-error">{error}</p> : null}

      {match && !error && !cached ? (
        <p className="link-analyze-note link-analyze-match" role="status">
          {t("analysis.linkMatch", { song: match.artist ? `${match.title} — ${match.artist}` : match.title })}
        </p>
      ) : null}

      {cached ? (
        <div className="link-analyze-result" role="status">
          <strong>
            {cached.artist ? `${cached.artist} - ` : ""}
            {cached.title}
          </strong>
          <span className="link-analyze-stats">
            {Math.round(cached.bpm)}
            {cached.bpm_alt ? ` / ${Math.round(cached.bpm_alt)}` : ""} BPM · {cached.key}
            {cached.camelot ? ` · ${cached.camelot}` : ""}
          </span>
          <span className="link-analyze-note">{t("analysis.linkCachedNote")}</span>
          <button className="text-button link-analyze-copy" type="button" onClick={() => copyPermalink(cached.id)}>
            {copied ? t("analysis.copied") : t("analysis.copyLink")}
          </button>
        </div>
      ) : null}

    </div>
  );
}
