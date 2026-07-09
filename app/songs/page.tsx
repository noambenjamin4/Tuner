import type { Metadata } from "next";
import Link from "next/link";
import { readAllSongs } from "@/lib/server/link-analysis";
import { SongBrowser } from "@/components/songs/SongBrowser";

// Index of every analyzed song. Acts as the hub that links out to each
// /song/<slug> page so crawlers can reach them all.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Song Key & BPM Database",
  description:
    "Browse the key, BPM, and Camelot code for songs analyzed on TuneBad, or analyze any track yourself for free.",
  alternates: { canonical: "/songs" },
};

export default async function SongsPage() {
  const songs = await readAllSongs(2000);

  return (
    <div className="app-shell">
      <header className="legal-topbar">
        <Link href="/" className="brand" aria-label="TuneBad, back to home">
          <span className="brand-logo-wrap">
            <picture>
              <source media="(prefers-color-scheme: dark)" srcSet="/logo-dark.png" />
              <img src="/logo-light.png" alt="" width={34} height={34} className="brand-logo" />
            </picture>
          </span>
          <span className="brand-wordmark">TUNEBAD</span>
        </Link>
      </header>

      <main>
        <article className="song-page">
          <h1 className="song-title">Song key &amp; BPM database</h1>
          <p className="song-lede">
            The key, BPM, and Camelot code for {songs.length} songs, analyzed from official previews.
            Want a track that is not here? <Link href="/key-bpm-finder">Analyze it yourself</Link>.
          </p>

          {songs.length === 0 ? (
            <p className="song-note">No songs analyzed yet. Be the first — paste a link on the Key &amp; BPM Finder.</p>
          ) : (
            <SongBrowser
              songs={songs.map((s) => ({
                slug: s.slug,
                title: s.title,
                artist: s.artist,
                bpm: s.bpm,
                key: s.key,
                camelot: s.camelot,
              }))}
            />
          )}
        </article>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="site-footer-brand">
            <picture>
              <source media="(prefers-color-scheme: dark)" srcSet="/logo-dark.png" />
              <img src="/logo-light.png" alt="" width={24} height={24} className="site-footer-logo" loading="lazy" />
            </picture>
            <span className="site-footer-wordmark">TUNEBAD</span>
          </div>
          <p className="site-footer-copyright">© 2026 TuneBad</p>
        </div>
      </footer>
    </div>
  );
}
