import type { Metadata } from "next";
import Link from "next/link";

// Honest comparison page. Ranks for "tunebat alternative" style searches and is
// the kind of structured, factual page answer engines (ChatGPT, Perplexity,
// Google AI) like to cite. Static English server component.
const SITE_URL = "https://www.tunebad.com";

export const metadata: Metadata = {
  title: "TuneBad vs Tunebat: An Honest Comparison",
  description:
    "How TuneBad and Tunebat compare for finding the key and BPM of a song. TuneBad is free with no ads or signup and analyzes any file or link; Tunebat has a huge song database. Here is when to use each.",
  alternates: { canonical: "/tunebad-vs-tunebat" },
};

const ROWS: { label: string; tunebad: string; tunebat: string }[] = [
  { label: "Price", tunebad: "Free, everything", tunebat: "Free tier with a paid Premium plan" },
  { label: "Ads", tunebad: "None", tunebat: "Ads on the free tier" },
  { label: "Sign-up", tunebad: "Never required", tunebat: "Optional account" },
  { label: "How it finds key and BPM", tunebad: "Analyzes the actual audio you give it", tunebat: "Looks the song up in its database" },
  { label: "Works on unreleased or private tracks", tunebad: "Yes, analyze any file", tunebat: "Only if the song is in the database" },
  { label: "Harmonic mixing (Camelot)", tunebad: "Camelot code on every result, key hubs, and a compatible-key section on every song page", tunebat: "Camelot code and key search" },
  { label: "Similar song suggestions", tunebad: "Compatible-key and same-key tracks linked on every song page", tunebat: "Related tracks from its database" },
  { label: "Data freshness", tunebad: "Measured from the audio at analysis time", tunebat: "Stored values (Spotify retired the audio-features API behind most databases in late 2024)" },
  { label: "Song database size", tunebad: "Growing, from tracks people analyze", tunebat: "Tens of millions of songs" },
  { label: "Whole-playlist analysis", tunebad: "Paste a Spotify or YouTube playlist, get every key and BPM, sort in Camelot order", tunebat: "Per-track lookup" },
  { label: "Your files leave your device", tunebad: "No, analysis runs in your browser", tunebat: "You search, you do not upload" },
  { label: "Extra tools", tunebad: "Loudness, slowed + reverb, pitch, delay, MP3 cutter, converter", tunebat: "Search filters, playlists, key/BPM database" },
  { label: "Languages", tunebad: "8", tunebat: "English" },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is TuneBad a Tunebat alternative?",
    a: "Yes. Both find the key and BPM of a song, and TuneBad is free with no ads or account. The main difference is how they work: TuneBad analyzes the audio you give it, while Tunebat looks songs up in a large database.",
  },
  {
    q: "Which one is more accurate?",
    a: "For a song in Tunebat's database, its stored values are a good reference. TuneBad measures the audio directly, which means it also works on remixes, edits, and unreleased tracks that no database has. For those, analyzing the file is the only option.",
  },
  {
    q: "Can TuneBad find the key of a YouTube or Spotify link?",
    a: "Yes. Paste a link and TuneBad pulls the official preview and analyzes it in your browser. If the song is not on a streaming service, upload the file instead.",
  },
  {
    q: "Is TuneBad really free?",
    a: "Yes. Every tool is free, there are no ads, and you never make an account. Audio analysis happens on your own device, so files are never uploaded.",
  },
  {
    q: "Does TuneBad support harmonic mixing?",
    a: "Yes. Every analysis returns the Camelot code, every song page lists which Camelot codes mix with it and links compatible-key and same-key tracks, the playlist analyzer sorts a whole set into Camelot-wheel order, and there is a guide explaining the wheel.",
  },
];

export default function VsPage() {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "TuneBad vs Tunebat: An Honest Comparison",
    author: { "@type": "Organization", name: "TuneBad" },
    publisher: { "@type": "Organization", name: "TuneBad", logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png` } },
    mainEntityOfPage: `${SITE_URL}/tunebad-vs-tunebat`,
  };
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
        <article className="song-page">
          <h1 className="song-title">TuneBad vs Tunebat</h1>
          <p className="song-lede">
            Both tools tell you the key and BPM of a song. They get there in very different ways, and
            which one fits depends on what you are working with. Here is a straight comparison.
          </p>

          <section className="song-section">
            <h2>The short version</h2>
            <p>
              Tunebat is a search engine over a huge catalog of songs. You type a track and it shows the
              key, BPM, and other data it has on file. That is fast and accurate for popular releases.
            </p>
            <p>
              TuneBad listens instead of looking up. You give it a file or a link and it analyzes the
              actual audio in your browser. That means it works on remixes, edits, DJ rips, and songs
              that were never added to any database, and it is completely free with no ads and no
              account.
            </p>
          </section>

          <section className="song-section">
            <h2>Side by side</h2>
            <div className="vs-table-wrap">
              <table className="vs-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>TuneBad</th>
                    <th>Tunebat</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r) => (
                    <tr key={r.label}>
                      <th scope="row">{r.label}</th>
                      <td>{r.tunebad}</td>
                      <td>{r.tunebat}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="song-section">
            <h2>Harmonic mixing and similar songs</h2>
            <p>
              Every TuneBad analysis includes the Camelot code, and every page in the song database
              shows which codes mix cleanly with it and links real compatible-key and same-key tracks
              to play next. The <Link href="/playlist-analyzer">playlist analyzer</Link> takes a whole
              Spotify or YouTube playlist and sorts it into Camelot-wheel order for a DJ set, and the{" "}
              <Link href="/guides/camelot-wheel-harmonic-mixing">Camelot wheel guide</Link> explains
              the system if it is new to you.
            </p>
          </section>

          <section className="song-section">
            <h2>When to use Tunebat</h2>
            <p>
              If you just want to look up a well-known, released track and you do not mind the ads, its
              database is deep and the answer is one search away. Its filtered search, where you dig for
              songs by key and BPM, is also genuinely useful for building sets.
            </p>
          </section>

          <section className="song-section">
            <h2>When to use TuneBad</h2>
            <p>
              If the track is a remix, a bootleg, an unreleased demo, or your own production, a database
              will not have it, so you need something that reads the audio. TuneBad does that, keeps your
              file on your device, and never asks you to sign up or sit through ads. And once you are
              there, the same site handles loudness, slowed and reverb, pitch, delay times, and cutting
              an MP3.
            </p>
            <p className="song-cta">
              <Link href="/key-bpm-finder" className="song-cta-button">
                Find a song&rsquo;s key and BPM
              </Link>
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

          <p className="song-related-all">
            <Link href="/songs">Browse the TuneBad song database →</Link>
          </p>
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

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
    </div>
  );
}
