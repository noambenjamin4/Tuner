import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readAllSongs } from "@/lib/server/link-analysis";
import { readSongsByArtist, topArtistsByCount, artistStats } from "@/lib/server/artists";

// Artist hub pages: /artist/<slug>, one per artist with enough analyzed songs
// to be worth a page. Mirrors the /songs/key/[slug] hub structure and copy
// tone. There is no way to query Supabase by a computed slug (the slug is
// derived client-side from the free-text `artist` column, PostgREST can't
// filter on that), so this pages through the full catalog and groups by slug
// — see lib/server/artists.ts for why that's the correct tradeoff at this
// scale, not just the simplest one.
export const revalidate = 3600;
export const dynamicParams = true;

const SITE_URL = "https://www.tunebad.com";
// Render rule (kept consistent everywhere an artist link can appear — this
// page, /song/[slug], /songs, and the sitemap hubs shard): an artist page
// only exists with >=2 analyzed songs. Below that it 404s rather than
// rendering a thin one-song page.
const MIN_SONGS = 2;
// Pre-render the biggest artists at build time; the long tail resolves via
// ISR on first visit (dynamicParams true + revalidate above).
const STATIC_PARAM_COUNT = 500;

export async function generateStaticParams() {
  const songs = await readAllSongs(50000);
  return topArtistsByCount(songs, STATIC_PARAM_COUNT, MIN_SONGS).map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const artist = await readSongsByArtist(slug);
  if (!artist || artist.songs.length < MIN_SONGS) {
    return { title: "Not found | TuneBad", robots: { index: false, follow: true } };
  }
  const { bpmMin, bpmMax } = artistStats(artist.songs);
  const bpmRange = bpmMin === bpmMax ? `${bpmMin} BPM` : `${bpmMin}-${bpmMax} BPM`;
  return {
    title: `${artist.name} — Songs with Key & BPM`,
    description: `The key, BPM, and Camelot code for ${artist.songs.length} songs by ${artist.name}, ranging ${bpmRange}. Useful for DJs building sets and producers sampling ${artist.name} tracks.`,
    alternates: { canonical: `/artist/${slug}` },
  };
}

export default async function ArtistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const artist = await readSongsByArtist(slug);
  if (!artist || artist.songs.length < MIN_SONGS) notFound();

  const songs = [...artist.songs].sort((a, b) => a.title.localeCompare(b.title));
  const { bpmMin, bpmMax, topKey } = artistStats(songs);
  const bpmRange = bpmMin === bpmMax ? `${bpmMin} BPM` : `${bpmMin}-${bpmMax} BPM`;

  const listJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Songs by ${artist.name}`,
    numberOfItems: songs.length,
    itemListElement: songs.slice(0, 50).map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/song/${s.slug}`,
      name: s.title,
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
            <Link href="/songs">Songs</Link> / {artist.name}
          </p>
          <h1 className="song-title">{artist.name} — songs with key &amp; BPM</h1>
          <p className="song-lede">
            {songs.length} analyzed {songs.length === 1 ? "song" : "songs"} by <strong>{artist.name}</strong>,
            spanning {bpmRange}
            {topKey ? (
              <>
                {" "}
                and most often landing in <strong>{topKey}</strong>
              </>
            ) : null}
            . Each track below shows its exact key, Camelot code, and BPM.
          </p>

          <section className="song-section">
            <h2>The list</h2>
            <ul className="song-index">
              {songs.map((s) => (
                <li key={s.slug}>
                  <Link href={`/song/${s.slug}`}>
                    <span className="song-index-name">{s.title}</span>
                    <span className="song-index-meta font-mono">
                      {s.key}
                      {s.camelot ? ` · ${s.camelot}` : ""} · {Math.round(s.bpm)} BPM
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <p className="song-note">
            These figures come from analyzing official 30-second previews with TuneBad&rsquo;s
            in-browser engine. Missing a track by {artist.name}?{" "}
            <Link href="/key-bpm-finder">Analyze it yourself</Link> — free, no account, and your file
            never leaves your device.
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
