import type { Metadata } from "next";
import Link from "next/link";
import { readAllSongs } from "@/lib/server/link-analysis";
import { SongBrowser } from "@/components/songs/SongBrowser";
import { SongSearch } from "@/components/songs/SongSearch";
import { ALL_KEYS, keyToSlug } from "@/lib/audio/harmonic";
import { camelot } from "@/lib/audio/constants";
import { topArtistsByCount } from "@/lib/server/artists";
import { ACTIVITIES } from "@/lib/server/activities";

// Index of every analyzed song. Acts as the hub that links out to each
// /song/<slug> page so crawlers can reach them all.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Song Key & BPM Database",
  description:
    "Browse the key, BPM, and Camelot code for songs analyzed on TuneBad, or analyze any track yourself for free.",
  alternates: { canonical: "/songs" },
};

// The hub/count computations want the full catalog, but rendering every row
// is a page-weight problem (1.6MB of HTML at ~4k songs and growing): the
// browsable table shows the latest LIST_CAP, and crawlers reach the rest
// through the sitemap and the key/BPM hub mesh.
const LIST_CAP = 2000;

export default async function SongsPage() {
  const songs = await readAllSongs(50000);

  // Crawlable browse links: keys that actually have songs, and the most
  // common integer BPMs (the hub pages 404 below 3 songs, so mirror that).
  const keyCounts = new Map<string, number>();
  const bpmCounts = new Map<number, number>();
  const camelotCounts = new Map<string, number>();
  for (const s of songs) {
    keyCounts.set(s.key, (keyCounts.get(s.key) ?? 0) + 1);
    const b = Math.round(s.bpm);
    for (let n = b - 2; n <= b + 2; n += 1) bpmCounts.set(n, (bpmCounts.get(n) ?? 0) + 1);
    if (s.camelot) {
      const c = s.camelot.toUpperCase();
      camelotCounts.set(c, (camelotCounts.get(c) ?? 0) + 1);
    }
  }
  const keyHubs = ALL_KEYS.filter((k) => (keyCounts.get(k) ?? 0) > 0);
  const bpmHubs = [...bpmCounts.entries()]
    .filter(([bpm, count]) => bpm >= 40 && bpm <= 220 && count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([bpm]) => bpm)
    .sort((a, b) => a - b);
  // 1A..12A, 1B..12B — same order the /camelot-wheel table and the
  // /songs/camelot/[code] hub pages use.
  const allCamelotCodes = [
    ...Array.from({ length: 12 }, (_, i) => `${i + 1}A`),
    ...Array.from({ length: 12 }, (_, i) => `${i + 1}B`),
  ];
  const camelotHubs = allCamelotCodes.filter((c) => (camelotCounts.get(c) ?? 0) > 0);
  const topArtists = topArtistsByCount(songs, 30);

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

          <SongSearch />

          {keyHubs.length > 0 && (
            <section className="song-section">
              <h2>Browse by key</h2>
              <ul className="song-keychips">
                {keyHubs.map((k) => (
                  <li key={k}>
                    <span className="song-keychip">{camelot[k]}</span>
                    <Link href={`/songs/key/${keyToSlug(k)}`} className="song-keychip-rel">
                      {k}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {bpmHubs.length > 0 && (
            <section className="song-section">
              <h2>Browse by BPM</h2>
              <ul className="song-keychips">
                {bpmHubs.map((b) => (
                  <li key={b}>
                    <Link href={`/songs/bpm/${b}`} className="song-keychip-rel">
                      {b} BPM
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {camelotHubs.length > 0 && (
            <section className="song-section">
              <h2>Browse by Camelot code</h2>
              <ul className="song-keychips">
                {camelotHubs.map((c) => (
                  <li key={c}>
                    <span className="song-keychip">{c}</span>
                    <Link href={`/songs/camelot/${c.toLowerCase()}`} className="song-keychip-rel">
                      {c}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="song-section">
            <h2>Browse by activity</h2>
            <ul className="song-keychips">
              {ACTIVITIES.map((a) => (
                <li key={a.slug}>
                  <Link href={`/songs/bpm-for/${a.slug}`} className="song-keychip-rel">
                    {a.label} ({a.min}-{a.max} BPM)
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {topArtists.length > 0 && (
            <section className="song-section">
              <h2>Browse by artist</h2>
              <ul className="song-keychips">
                {topArtists.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/artist/${a.slug}`} className="song-keychip-rel">
                      {a.name} ({a.songs.length})
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {songs.length === 0 ? (
            <p className="song-note">No songs analyzed yet. Be the first — paste a link on the Key &amp; BPM Finder.</p>
          ) : (
            <>
            {songs.length > LIST_CAP && (
              <p className="song-note">
                The table below shows the latest {LIST_CAP} songs. Every analyzed song is reachable
                through the key and BPM hubs above, or straight from search.
              </p>
            )}
            <SongBrowser
              songs={songs.slice(0, LIST_CAP).map((s) => ({
                slug: s.slug,
                title: s.title,
                artist: s.artist,
                bpm: s.bpm,
                key: s.key,
                camelot: s.camelot,
              }))}
            />
            </>
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
