import type { Metadata } from "next";
import Link from "next/link";
import { I18nProvider } from "@/lib/i18n";
import { PlaylistAnalyzer } from "@/components/playlist/PlaylistAnalyzer";

export const metadata: Metadata = {
  title: "Free Playlist Analyzer: Key & BPM of Every Track",
  description:
    "Paste a Spotify or YouTube playlist link and get the key, BPM, and Camelot code for every track, in one table. Free, no signup, export to CSV.",
  alternates: { canonical: "/playlist-analyzer" },
  openGraph: { images: [{ url: "/og/key-bpm-finder.png", width: 1200, height: 630 }] },
};

export default function PlaylistAnalyzerPage() {
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
        <article className="song-page pa-page">
          <h1 className="song-title">Playlist key &amp; BPM analyzer</h1>
          <p className="song-lede">
            Paste a public Spotify or YouTube playlist link. TuneBad matches every track against its 2,500+ song
            community database first, then analyzes anything missing right in your browser with the same essentia
            engine as the <Link href="/key-bpm-finder">Key &amp; BPM Finder</Link>. No uploads, no signup.
          </p>

          {/* Wrapped in its own I18nProvider (this page lives outside TunebadApp).
              SSR renders English; the provider picks up the visitor's saved
              locale after hydration, same pattern as the homepage FAQ. */}
          <I18nProvider>
            <PlaylistAnalyzer />
          </I18nProvider>

          <section className="song-section pa-about">
            <h2>How it works</h2>
            <p>
              Spotify and YouTube do not publish key or BPM data, so TuneBad matches each track to its official
              30-second preview and runs the same key/BPM detection used across the site. Songs already analyzed by
              someone else show up instantly from the shared database; everything else is analyzed on the spot and
              added to it, so the database gets more complete with every playlist pasted here.
            </p>
          </section>
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
