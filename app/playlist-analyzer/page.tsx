import type { Metadata } from "next";
import Link from "next/link";
import { I18nProvider } from "@/lib/i18n";
import { PlaylistAnalyzer } from "@/components/playlist/PlaylistAnalyzer";

export const metadata: Metadata = {
  title: "Free Playlist Analyzer: Key & BPM of Every Track",
  description:
    "Paste a Spotify or YouTube playlist link and get the key, BPM, and Camelot code for every track, in one table. Free, no signup, export to CSV.",
  alternates: { canonical: "/playlist-analyzer" },
  openGraph: { images: [{ url: "/og/playlist-analyzer.png", width: 1200, height: 630 }] },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "Which playlists can I analyze?",
    a: "Any public Spotify or YouTube playlist. Paste the share link and TuneBad reads the tracklist. Private playlists won't work, since it can only see what's public.",
  },
  {
    q: "Where do the key and BPM come from?",
    a: "Not from Spotify or YouTube, since they don't publish that data. TuneBad matches each track to its official 30-second preview and measures the key and BPM from the audio itself, the same way the Key & BPM Finder does.",
  },
  {
    q: "Why do some tracks load instantly and others take a second?",
    a: "Songs someone already analyzed come straight from the shared database, so they appear right away. Anything new is analyzed on the spot in your browser and added to the database, so the next person who needs it gets it instantly.",
  },
  {
    q: "How accurate is it?",
    a: "The key and Camelot code are read from the audio, so they're reliable. BPM is usually spot-on too, but a track with a vague or half-time beat can come back at double or half speed, so trust your ears if a number looks off.",
  },
  {
    q: "Can I export the results?",
    a: "Yes. Export the whole table to CSV, or sort it by Camelot code to line up harmonically compatible tracks for a set.",
  },
  {
    q: "Is anything uploaded?",
    a: "Only the playlist link. The audio analysis runs in your browser, and nothing from your device is uploaded.",
  },
];

export default function PlaylistAnalyzerPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
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

          <section className="song-section">
            <h2>Common questions</h2>
            {FAQS.map((f) => (
              <details key={f.q} className="seo-faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </section>

          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
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
