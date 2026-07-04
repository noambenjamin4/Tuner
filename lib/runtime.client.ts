// Client-safe subset of lib/runtime.ts. Client components must import from
// here, never from lib/runtime.ts directly — that module also reads
// server-only secrets (DOWNLOADER_REMOTE_URL / DOWNLOADER_API_KEY), and any
// client import of it (even for a single unrelated export) pulls the whole
// module into the browser bundle, leaking those env var references into
// client JS. Keep this file limited to NEXT_PUBLIC_* reads only.

// Client-side: gates whether the UI even offers the link-download card.
// Must be NEXT_PUBLIC_ to be readable in the browser bundle.
export const downloaderVisible = process.env.NEXT_PUBLIC_DOWNLOADER === "1";
