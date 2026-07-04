// Server-only feature flags for the link downloader, which shells out to
// yt-dlp/ffmpeg and can't run in a serverless deployment (e.g. Vercel) unless
// proxied to a standalone remote downloader server (see server/). By default
// it's off so a production deploy is safe with zero configuration.
//
// IMPORTANT: this module reads server-only secrets and must never be
// imported from a client component — even importing a single export pulls
// the whole module (and its process.env.DOWNLOADER_* references) into the
// browser bundle. Client code needs the UI flag only: import
// `downloaderVisible` from "@/lib/runtime.client" instead.

// Remote downloader (server/) connection details — server-side only, never
// exposed to the client. When both are set, the /api/youtube* routes proxy to
// this server instead of shelling out to a local yt-dlp binary.
export const remoteDownloaderUrl = process.env.DOWNLOADER_REMOTE_URL || null;
export const remoteDownloaderKey = process.env.DOWNLOADER_API_KEY || null;

// Server-side: gates the /api/youtube/* route handlers. True if the local
// yt-dlp path is explicitly enabled, OR a remote downloader is configured.
export const isDownloaderEnabled =
  process.env.ENABLE_LINK_DOWNLOADER === "1" || Boolean(remoteDownloaderUrl && remoteDownloaderKey);

export { downloaderVisible } from "./runtime.client";
