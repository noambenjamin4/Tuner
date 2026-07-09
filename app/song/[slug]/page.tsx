import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  readAnalysisBySlug,
  readAllSongs,
  readSongsByCamelot,
  type CachedAnalysis,
} from "@/lib/server/link-analysis";
import { compatibleCodes, relationLabel, keyToSlug, slugToKey } from "@/lib/audio/harmonic";

// Programmatic per-song pages, one for every track in the shared link-analysis
// cache. Statically generated for the songs known at build time and filled in
// on demand (ISR) as the cache grows from live "analyze from link" usage.
export const revalidate = 3600;
export const dynamicParams = true;

const SITE_URL = "https://www.tunebad.com";

export async function generateStaticParams() {
  const songs = await readAllSongs(2000);
  return songs.map((s) => ({ slug: s.slug }));
}

function displayTitle(song: CachedAnalysis): string {
  return song.artist ? `${song.title} by ${song.artist}` : song.title;
}

function tempoFeel(bpm: number): string {
  if (bpm < 90) return "a relaxed, downtempo pace";
  if (bpm < 110) return "a mid-tempo groove";
  if (bpm < 130) return "a steady dance-floor tempo";
  if (bpm < 150) return "an up-tempo, energetic pace";
  return "a fast, high-energy tempo";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const song = await readAnalysisBySlug(slug);
  if (!song) return { title: "Song not found | TuneBad", robots: { index: false, follow: true } };
  const name = displayTitle(song);
  const alt = song.bpm_alt ? ` (or ${Math.round(song.bpm_alt)})` : "";
  return {
    title: `${name} — Key, BPM & Camelot`,
    description: `${name} is in the key of ${song.key} at ${Math.round(song.bpm)} BPM${alt}, Camelot ${song.camelot ?? "N/A"}. See its energy, danceability, loudness, and harmonically compatible tracks to mix with.`,
    alternates: { canonical: `/song/${song.slug}` },
    openGraph: {
      title: `${name} — Key & BPM`,
      description: `Key ${song.key}, ${Math.round(song.bpm)} BPM, Camelot ${song.camelot ?? "N/A"}.`,
      url: `${SITE_URL}/song/${song.slug}`,
    },
  };
}

function pct(v: number | null): string {
  return v == null ? "N/A" : `${Math.round(v * 100)}`;
}

function Stat({
  label,
  value,
  note,
  meter,
}: {
  label: string;
  value: string;
  note: string;
  meter?: number | null;
}) {
  return (
    <div className="metric-card">
      <small>{label}</small>
      <strong className="analysis-value">{value}</strong>
      {meter != null ? (
        <div className="stat-meter" aria-hidden="true">
          <span style={{ width: `${Math.round(meter * 100)}%` }} />
        </div>
      ) : null}
      <em>{note}</em>
    </div>
  );
}

// Production masks Server Component errors behind a digest; this wrapper puts
// the real message in the function logs so failures here stay diagnosable.
export default async function SongPage(props: { params: Promise<{ slug: string }> }) {
  try {
    return await SongPageInner(props);
  } catch (error) {
    const digestish = error as { digest?: string };
    if (digestish?.digest !== "NEXT_HTTP_ERROR_FALLBACK;404") {
      console.error(
        "song page render error:",
        String(error),
        error instanceof Error ? (error.stack ?? "").slice(0, 600) : "",
      );
    }
    throw error;
  }
}

async function SongPageInner({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const song = await readAnalysisBySlug(slug);
  if (!song) notFound();

  const name = displayTitle(song);
  const artistName = song.artist ?? "the artist";
  const bpm = Math.round(song.bpm);
  const bpmAlt = song.bpm_alt ? Math.round(song.bpm_alt) : null;
  const camelot = song.camelot ?? null;

  // Harmonic-mix neighbours (real songs the DJ can beatmatch into).
  const compat = camelot ? compatibleCodes(camelot) : [];
  const relatedByKey = camelot
    ? await readSongsByCamelot([camelot, ...compat], song.slug, 14)
    : [];
  const sameKey = relatedByKey.filter((s) => s.camelot === camelot).slice(0, 6);
  const mixable = relatedByKey.filter((s) => s.camelot !== camelot).slice(0, 6);

  // A general fallback set so the page always has outbound links.
  const others =
    relatedByKey.length >= 4
      ? []
      : (await readAllSongs(40)).filter((s) => s.slug !== song.slug).slice(0, 8);

  const musicJsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    name: song.title,
    ...(song.artist ? { byArtist: { "@type": "MusicGroup", name: song.artist } } : {}),
    url: `${SITE_URL}/song/${song.slug}`,
    ...(song.duration_s ? { duration: `PT${Math.round(song.duration_s)}S` } : {}),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Songs", item: `${SITE_URL}/songs` },
      { "@type": "ListItem", position: 2, name, item: `${SITE_URL}/song/${song.slug}` },
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
          <p className="song-crumb">
            <Link href="/songs">Songs</Link> / {song.key} · {bpm} BPM
          </p>
          <h1 className="song-title">
            {song.title}
            {song.artist ? <span className="song-artist"> by {song.artist}</span> : null}
          </h1>

          <p className="song-lede">
            {song.title} by {artistName} is in the key of <strong>{song.key}</strong> and runs at{" "}
            <strong>{bpm} BPM</strong>
            {bpmAlt ? ` (or ${bpmAlt} BPM if you count it half-time)` : ""}, {tempoFeel(bpm)}.
            {camelot
              ? ` Its Camelot code is ${camelot}, which is what you match against when you are mixing it harmonically with another track.`
              : ""}
          </p>

          <div className="summary-grid song-stats">
            <Stat label="BPM" value={bpmAlt ? `${bpm} or ${bpmAlt}` : String(bpm)} note="Tempo" />
            <Stat label="Key" value={song.key} note="Musical key" />
            <Stat label="Camelot" value={camelot ?? "N/A"} note="For harmonic mixing" />
            <Stat label="Energy" value={pct(song.energy)} note="Out of 100" meter={song.energy} />
            <Stat label="Danceability" value={pct(song.danceability)} note="Out of 100" meter={song.danceability} />
            <Stat label="Loudness" value={song.loudness_db != null ? `${song.loudness_db}` : "N/A"} note="dBFS" />
          </div>

          {camelot && compat.length > 0 && (
            <section className="song-section">
              <h2>What mixes with {song.title}</h2>
              <p>
                On the Camelot wheel, {song.title} sits at {camelot}. These keys blend with it without
                clashing, so tracks in them are safe to beatmatch in or out:
              </p>
              <ul className="song-keychips">
                {compat.map((code) => (
                  <li key={code}>
                    <span className="song-keychip">{code}</span>
                    <span className="song-keychip-rel">{relationLabel(camelot, code)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {mixable.length > 0 && (
            <section className="song-section">
              <h2>Tracks to mix into it</h2>
              <p>Other analyzed songs in a compatible key, ready to line up next in a set:</p>
              <ul className="song-list">
                {mixable.map((s) => (
                  <li key={s.slug}>
                    <Link href={`/song/${s.slug}`}>
                      {s.title}
                      {s.artist ? ` — ${s.artist}` : ""}
                    </Link>
                    <span className="song-list-meta">
                      {" "}
                      {s.camelot} · {Math.round(s.bpm)} BPM
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {sameKey.length > 0 && (
            <section className="song-section">
              <h2>More songs in {song.key}</h2>
              <ul className="song-list">
                {sameKey.map((s) => (
                  <li key={s.slug}>
                    <Link href={`/song/${s.slug}`}>
                      {s.title}
                      {s.artist ? ` — ${s.artist}` : ""}
                    </Link>
                    <span className="song-list-meta"> {Math.round(s.bpm)} BPM</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="song-hubs">
            {slugToKey(keyToSlug(song.key)) ? (
              <Link href={`/songs/key/${keyToSlug(song.key)}`}>All songs in {song.key} →</Link>
            ) : null}
            <Link href={`/songs/bpm/${bpm}`}>All songs at {bpm} BPM →</Link>
          </p>

          <p className="song-note">
            These figures come from analyzing an official 30-second preview of the track with
            TuneBad&rsquo;s in-browser engine. Tempo and key are reliable, but a preview is a sample of
            the full song, so treat them as a strong estimate. For an exact read, analyze the full file
            yourself &mdash; it is free and runs entirely in your browser.
          </p>

          <p className="song-cta">
            <Link href="/key-bpm-finder" className="song-cta-button">
              Analyze a song yourself
            </Link>
          </p>

          {others.length > 0 && (
            <section className="song-section">
              <h2>Other songs</h2>
              <ul className="song-list">
                {others.map((s) => (
                  <li key={s.slug}>
                    <Link href={`/song/${s.slug}`}>
                      {s.title}
                      {s.artist ? ` — ${s.artist}` : ""}
                    </Link>
                    <span className="song-list-meta">
                      {" "}
                      {s.key} · {Math.round(s.bpm)} BPM
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

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

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(musicJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
    </div>
  );
}
