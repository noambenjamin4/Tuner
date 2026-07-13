import type { Metadata } from "next";
import Link from "next/link";
import { camelot } from "@/lib/audio/constants";
import { compatibleCodes, keyToSlug } from "@/lib/audio/harmonic";
import { CamelotWheel } from "./CamelotWheel";

// Standalone, crawlable Camelot wheel page: an interactive chart (client
// island) on top of fully server-rendered reference content — the 24-code
// table linking every key hub is the mesh that makes this page rank for
// "camelot wheel". English server component, copyright-shell pattern like
// /tunebad-vs-tunebat.
const SITE_URL = "https://www.tunebad.com";

export const metadata: Metadata = {
  title: "Camelot Wheel: Interactive Harmonic Mixing Chart",
  description:
    "A free interactive Camelot wheel. Click any of the 24 codes to see its musical key, which codes mix cleanly with it, and real analyzed songs in that key.",
  alternates: { canonical: "/camelot-wheel" },
  openGraph: { images: [{ url: "/og/camelot-wheel.png", width: 1200, height: 630 }] },
};

// code -> key name, straight from the analyzer's own mapping so this page can
// never disagree with an analysis result.
const CODE_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(camelot).map(([key, code]) => [code, key]),
);

// Table order: 1A..12A then 1B..12B.
const ALL_CODES = [
  ...Array.from({ length: 12 }, (_, i) => `${i + 1}A`),
  ...Array.from({ length: 12 }, (_, i) => `${i + 1}B`),
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "What is the Camelot wheel?",
    a: "The Camelot wheel arranges all 24 musical keys on a clock face so DJs can pick compatible songs without music theory. Each key gets a code: a number from 1 to 12 plus a letter, A for minor keys on the inner ring and B for major keys on the outer ring. Keys that sit next to each other on the wheel share most of their notes, so tracks in those keys blend cleanly.",
  },
  {
    q: "Which Camelot codes mix well together?",
    a: "From any code, three moves are always safe: stay on the same code (same key), move one step around the wheel in either direction (for example 8A to 7A or 9A), or swap the letter (8A to 8B, the relative major or minor). Everything else risks a key clash, though breaking the rules on purpose can work as an effect.",
  },
  {
    q: "Is the Camelot wheel the same as the circle of fifths?",
    a: "It encodes the same relationships. Moving one number around the Camelot wheel is a fifth apart musically, and swapping A for B is the relative major/minor. The Camelot system just renames everything so compatible keys are always plus or minus one number, which is faster to read mid-set.",
  },
  {
    q: "How do I find a song's Camelot code?",
    a: "Use the free key and BPM finder on TuneBad: search a song by name, paste a YouTube or Spotify link, or upload the file. Every analysis returns the musical key and its Camelot code, measured from the audio itself in your browser.",
  },
  {
    q: "Can I change key for an energy lift?",
    a: "Yes, and two moves do it without clashing. Jump up two numbers on the same letter, like 8A to 10A, for a noticeable lift in energy, or swap the letter, like 8A to 8B, to move between minor and major and change the mood. Both sound deliberate rather than off-key, which is why DJs use them to build or reset a set.",
  },
];

export default function CamelotWheelPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "TuneBad", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Camelot Wheel", item: `${SITE_URL}/camelot-wheel` },
    ],
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
          <h1 className="song-title">Camelot Wheel</h1>
          <p className="song-lede">
            The Camelot wheel maps all 24 musical keys onto a clock so you can pick songs that mix
            in key without thinking about music theory. Click any code below: its compatible
            neighbors light up, and you get the key name plus real songs in that key.
          </p>

          <section className="song-section">
            <CamelotWheel />
          </section>

          <section className="song-section">
            <h2>How the wheel works</h2>
            <p>
              Every key gets a code from 1 to 12 plus a letter. The inner ring is minor keys
              (letter A) and the outer ring is major keys (letter B): A minor is 8A, C major is 8B.
              Neighboring numbers are a musical fifth apart, which means they share almost all of
              their notes.
            </p>
            <p>
              That layout gives you the three moves that always sound good: stay on the{" "}
              <strong>same code</strong>, move <strong>one number</strong> in either direction
              (7A or 9A from 8A), or <strong>swap the letter</strong> (8A to 8B, the relative
              major or minor). Going up one number tends to lift the energy of a set; going down
              one relaxes it. Anything further around the wheel starts to clash.
            </p>
            <p>
              To get the code for a specific track, use the{" "}
              <Link href="/key-bpm-finder">key &amp; BPM finder</Link> (search a song name, paste a
              link, or upload the file) — every result includes the Camelot code. To sort a whole
              set, the <Link href="/playlist-analyzer">playlist analyzer</Link> puts an entire
              Spotify or YouTube playlist into Camelot order. The{" "}
              <Link href="/guides/camelot-wheel-harmonic-mixing">harmonic mixing guide</Link>{" "}
              covers the technique in more depth.
            </p>
          </section>

          <section className="song-section">
            <h2>All 24 Camelot codes</h2>
            <div className="vs-table-wrap">
              <table className="vs-table">
                <thead>
                  <tr>
                    <th scope="col">Code</th>
                    <th scope="col">Musical key</th>
                    <th scope="col">Mixes with</th>
                    <th scope="col">Songs</th>
                  </tr>
                </thead>
                <tbody>
                  {ALL_CODES.map((code) => {
                    const key = CODE_TO_KEY[code];
                    return (
                      <tr key={code}>
                        <th scope="row">
                          <Link href={`/songs/camelot/${code.toLowerCase()}`}>{code}</Link>
                        </th>
                        <td>{key}</td>
                        <td>{compatibleCodes(code).join(", ")}</td>
                        <td>
                          <Link href={`/songs/key/${keyToSlug(key)}`}>Songs in {key}</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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

          <p className="song-cta">
            <Link href="/key-bpm-finder" className="song-cta-button">
              Find a song&rsquo;s key and Camelot code
            </Link>
          </p>
          <p className="song-related-all">
            <Link href="/guides/camelot-wheel-harmonic-mixing">Read the harmonic mixing guide →</Link>
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

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
    </div>
  );
}
