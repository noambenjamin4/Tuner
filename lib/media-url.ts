// Shared media URL validation — used by the API route (authoritative) and
// the converter UI (instant feedback). Supports YouTube plus a small allowlist
// of other platforms that yt-dlp can pull audio from.
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{10,64}$/;

const SOUNDCLOUD_HOSTS = new Set(["soundcloud.com", "on.soundcloud.com", "m.soundcloud.com"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
const MIXCLOUD_HOSTS = new Set(["mixcloud.com", "www.mixcloud.com"]);
const AUDIOMACK_HOSTS = new Set(["audiomack.com", "www.audiomack.com"]);

// Extracts and validates the 11-char video ID, then rebuilds a canonical URL so
// raw user input never reaches the yt-dlp child process.
export function canonicalYouTubeUrl(input: string): { url: string; videoId: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (!YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) return null;

  let videoId: string | null = null;
  if (parsed.hostname.toLowerCase() === "youtu.be") {
    videoId = parsed.pathname.split("/")[1] || null;
  } else if (parsed.pathname === "/watch") {
    videoId = parsed.searchParams.get("v");
  } else {
    const pathMatch = parsed.pathname.match(/^\/(shorts|live|embed)\/([^/]+)/);
    if (pathMatch) videoId = pathMatch[2];
  }

  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) return null;
  return { url: `https://www.youtube.com/watch?v=${videoId}`, videoId };
}

// Extracts and validates a YouTube playlist id (from either
// youtube.com/playlist?list=<id> or youtube.com/watch?...&list=<id>), then
// rebuilds a canonical playlist URL so raw user input never reaches the
// yt-dlp child process. Deliberately strict even though the caller also runs
// yt-dlp with shell:false + `--`.
export function validatePlaylistUrl(input: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (!YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) return null;

  const listId = parsed.searchParams.get("list");
  if (!listId || !PLAYLIST_ID_PATTERN.test(listId)) return null;

  return `https://www.youtube.com/playlist?list=${listId}`;
}

const SPOTIFY_ID_PATTERN = /^[A-Za-z0-9]{22}$/;

// Recognizes a public Spotify playlist/album/track link (or spotify: URI) and
// extracts its kind + base62 id. Deliberately strict — this id is embedded
// directly into an `open.spotify.com/embed/...` fetch URL (see
// app/api/spotify/route.ts), so it must never carry anything beyond the
// validated base62 pattern.
export function validateSpotifyUrl(input: string): { kind: "playlist" | "album" | "track"; id: string } | null {
  const trimmed = input.trim();

  const uriMatch = trimmed.match(/^spotify:(playlist|album|track):([A-Za-z0-9]+)$/);
  if (uriMatch) {
    const [, kind, id] = uriMatch;
    if (!SPOTIFY_ID_PATTERN.test(id)) return null;
    return { kind: kind as "playlist" | "album" | "track", id };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.hostname.toLowerCase() !== "open.spotify.com") return null;

  const pathMatch = parsed.pathname.match(/^\/(?:intl-[a-z]{2}\/)?(playlist|album|track)\/([A-Za-z0-9]+)/);
  if (!pathMatch) return null;
  const [, kind, id] = pathMatch;
  if (!SPOTIFY_ID_PATTERN.test(id)) return null;

  return { kind: kind as "playlist" | "album" | "track", id };
}

// Validates and canonicalizes a URL across all supported platforms. Raw user
// input never reaches the yt-dlp child process — only the rebuilt, sanitized
// URL returned here does.
export function validateMediaUrl(input: string): { url: string; platform: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  const host = parsed.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.has(host)) {
    const canonical = canonicalYouTubeUrl(input);
    if (!canonical) return null;
    return { url: canonical.url, platform: "YouTube" };
  }

  let platform: string | null = null;
  if (SOUNDCLOUD_HOSTS.has(host)) platform = "SoundCloud";
  else if (host.endsWith(".bandcamp.com")) platform = "Bandcamp";
  else if (VIMEO_HOSTS.has(host)) platform = "Vimeo";
  else if (MIXCLOUD_HOSTS.has(host)) platform = "Mixcloud";
  else if (AUDIOMACK_HOSTS.has(host)) platform = "Audiomack";

  if (!platform) return null;
  if (parsed.pathname.length <= 1) return null; // reject bare homepages

  const sanitized = `https://${parsed.hostname}${parsed.pathname}${parsed.search}`;
  return { url: sanitized, platform };
}
