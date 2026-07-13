import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readSongsByBpmRange, readAllSongs } from "@/lib/server/link-analysis";

// BPM hub pages: /songs/bpm/140 etc. Each lists analyzed songs within ±2 BPM —
// the "140 bpm songs" search intent DJs and runners actually type.
export const revalidate = 3600;
export const dynamicParams = true;

const SITE_URL = "https://www.tunebad.com";
const BPM_MIN = 40;
const BPM_MAX = 220;
const WINDOW = 2;
// A hub page below this many songs is thin; serve 404 instead.
const MIN_SONGS = 3;

function parseBpm(raw: string): number | null {
  if (!/^\d{2,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= BPM_MIN && n <= BPM_MAX ? n : null;
}

function tempoContext(bpm: number): string {
  if (bpm < 90) return "downtempo, boom bap, and slower soul records";
  if (bpm < 110) return "hip hop, afrobeats, and mid-tempo pop";
  if (bpm < 128) return "house-tempo pop and dance records";
  if (bpm < 145) return "house, techno, and up-tempo pop";
  if (bpm < 170) return "trap, dubstep-tempo, and fast rap records";
  return "drum and bass, footwork, and double-time rap";
}

export async function generateStaticParams() {
  // Pre-render every BPM that has enough songs; others resolve via ISR.
  const songs = await readAllSongs(100000);
  const counts = new Map<number, number>();
  for (const s of songs) {
    const b = Math.round(s.bpm);
    for (let n = b - WINDOW; n <= b + WINDOW; n += 1) {
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([bpm, count]) => bpm >= BPM_MIN && bpm <= BPM_MAX && count >= MIN_SONGS)
    .map(([bpm]) => ({ bpm: String(bpm) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bpm: string }>;
}): Promise<Metadata> {
  const { bpm: raw } = await params;
  const bpm = parseBpm(raw);
  if (!bpm) return { title: "Not found | TuneBad", robots: { index: false, follow: true } };
  return {
    title: `${bpm} BPM Songs — Tracks at ${bpm} BPM`,
    description: `Songs at ${bpm} BPM (±2), each with its musical key and Camelot code. A tempo pool for DJ sets, mashups, edits, and workout playlists at ${bpm} BPM.`,
    alternates: { canonical: `/songs/bpm/${bpm}` },
  };
}

export default async function BpmHubPage({ params }: { params: Promise<{ bpm: string }> }) {
  const { bpm: raw } = await params;
  const bpm = parseBpm(raw);
  if (!bpm) notFound();

  const songs = await readSongsByBpmRange(bpm - WINDOW, bpm + WINDOW, 300);
  if (songs.length < MIN_SONGS) notFound();

  const half = Math.round(bpm / 2);
  const double = bpm * 2;

  const listJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Songs at ${bpm} BPM`,
    numberOfItems: songs.length,
    itemListElement: songs.slice(0, 50).map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/song/${s.slug}`,
      name: s.artist ? `${s.title} by ${s.artist}` : s.title,
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
          <p className="song-crumb">
            <Link href="/songs">Songs</Link> / {bpm} BPM
          </p>
          <h1 className="song-title">Songs at {bpm} BPM</h1>
          <p className="song-lede">
            {songs.length} analyzed {songs.length === 1 ? "song" : "songs"} between {bpm - WINDOW} and{" "}
            {bpm + WINDOW} BPM — territory shared by {tempoContext(bpm)}. Each shows its key and
            Camelot code, so you can pick tracks that beatmatch <em>and</em> stay in key. Remember
            half and double time: a {bpm} BPM track also rides with {half} and {double} BPM material.
          </p>

          <section className="song-section">
            <h2>The list</h2>
            <ul className="song-index">
              {songs.map((s) => (
                <li key={s.slug}>
                  <Link href={`/song/${s.slug}`}>
                    <span className="song-index-name">
                      {s.title}
                      {s.artist ? <span className="song-index-artist"> — {s.artist}</span> : null}
                    </span>
                    <span className="song-index-meta font-mono">
                      {Math.round(s.bpm)} BPM · {s.key}
                      {s.camelot ? ` · ${s.camelot}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <p className="song-note">
            Tempos are measured from official 30-second previews with TuneBad&rsquo;s in-browser
            engine. Not sure of a track&rsquo;s BPM? <Link href="/key-bpm-finder">Analyze it</Link> or{" "}
            <Link href="/bpm-tap">tap it out</Link> — both free, no account.
          </p>

          <p className="song-related-all">
            <Link href="/songs">Browse all songs →</Link>
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

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(listJsonLd) }} />
    </div>
  );
}
