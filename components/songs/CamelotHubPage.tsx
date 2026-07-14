import Link from "next/link";
import { notFound } from "next/navigation";
import { countSongsByCamelotCode, readSongsByCamelotCode } from "@/lib/server/link-analysis";
import { compatibleCodes, relationLabel } from "@/lib/audio/harmonic";
import { camelot } from "@/lib/audio/constants";
import { MinimalFooter } from "@/components/layout/MinimalFooter";
import { HUB_PAGE_SIZE, HubPagination, hubHref } from "@/components/songs/HubPagination";
import { SITE_URL } from "@/lib/site";

// Camelot browse pages: /songs/camelot/8a etc. One per canonical Camelot
// code (24 total), listing every analyzed song in that code — the
// "camelot 8a songs" / "8a camelot mix" search intent. Mirrors the
// structure of /songs/key/[slug] (see that file) but keyed off the code
// instead of the key name.
export const ALL_CODES = [
  ...Array.from({ length: 12 }, (_, i) => `${i + 1}A`),
  ...Array.from({ length: 12 }, (_, i) => `${i + 1}B`),
];

// code -> key name, straight from the analyzer's own mapping (same source
// /camelot-wheel uses) so this page can never disagree with an analysis result.
export const CODE_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(camelot).map(([key, code]) => [code, key]),
);

/** "8a" / "8A" -> "8A", or null for anything not a canonical code. */
export function parseCode(raw: string): string | null {
  const m = /^(1[0-2]|[1-9])([ab])$/i.exec(raw.trim());
  if (!m) return null;
  const code = `${m[1]}${m[2].toUpperCase()}`;
  return CODE_TO_KEY[code] ? code : null;
}


export function camelotHubMeta(raw: string, page: number) {
  const code = parseCode(raw);
  const key = code ? CODE_TO_KEY[code] : null;
  if (!code || !key) return null;
  const base = `/songs/camelot/${code.toLowerCase()}`;
  const suffix = page > 1 ? ` — Page ${page}` : "";
  return {
    code,
    key,
    title: `Songs in Camelot ${code} (${key}) — Harmonic Mixing${suffix}`,
    description:
      page > 1
        ? `More songs in Camelot ${code} (${key}), ordered by BPM for building a set. Page ${page}.`
        : `A list of songs in Camelot ${code}, the DJ-friendly code for ${key}, ordered by BPM. See which Camelot codes mix cleanly with ${code} and browse real tracks.`,
    // Self-canonical per page: each holds different songs and carries the
    // internal links to them.
    canonical: hubHref(base, page),
  };
}

export async function CamelotHubPage({ code: raw, page }: { code: string; page: number }) {
  const code = parseCode(raw);
  const key = code ? CODE_TO_KEY[code] : null;
  if (!code || !key) notFound();

  const [songs, total] = await Promise.all([
    readSongsByCamelotCode(code, HUB_PAGE_SIZE, (page - 1) * HUB_PAGE_SIZE),
    countSongsByCamelotCode(code),
  ]);
  if (songs.length === 0) notFound();
  const totalPages = Math.max(1, Math.ceil(total / HUB_PAGE_SIZE));

  const compat = compatibleCodes(code);
  const compatInfo = compat
    .map((c) => {
      const k = CODE_TO_KEY[c];
      return k ? { code: c, key: k, rel: relationLabel(code, c) } : null;
    })
    .filter((x): x is { code: string; key: string; rel: string } => x !== null);

  const listJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Songs in Camelot ${code}`,
    numberOfItems: songs.length,
    itemListElement: songs.slice(0, 50).map((s, i) => ({
      "@type": "ListItem",
      position: (page - 1) * HUB_PAGE_SIZE + i + 1,
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
            <Link href="/songs">Songs</Link> /{" "}
            {page > 1 ? (
              <Link href={hubHref(`/songs/camelot/${code.toLowerCase()}`, 1)}>Camelot {code}</Link>
            ) : (
              `Camelot ${code}`
            )}
            {page > 1 ? ` / Page ${page}` : ""}
          </p>
          <h1 className="song-title">
            Songs in Camelot {code} ({key})
          </h1>
          <p className="song-lede">
            {total} analyzed {total === 1 ? "song" : "songs"} in Camelot{" "}
            <strong>{code}</strong>, the DJ-friendly code for <strong>{key}</strong> on the Camelot
            wheel. Codes mix cleanly when they share the same number and letter, sit one step
            around the wheel, or swap letter for the relative major/minor — so this list is a
            starting pool for harmonic sets around {code}: {compat.join(", ")}. Ordered by BPM,
            slowest first, so you can walk the tempo ladder.
          </p>

          {compatInfo.length > 0 && (
            <section className="song-section">
              <h2>Mixes with {code}</h2>
              <ul className="song-keychips">
                {compatInfo.map((c) => (
                  <li key={c.code}>
                    <span className="song-keychip">{c.code}</span>
                    <Link href={`/songs/camelot/${c.code.toLowerCase()}`} className="song-keychip-rel">
                      {c.key} ({c.rel})
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="song-note">
                See every code and how it connects on the{" "}
                <Link href="/camelot-wheel">interactive Camelot wheel</Link>.
              </p>
            </section>
          )}

          <section className="song-section">
            <h2>{page > 1 ? `The list — page ${page} of ${totalPages}` : "The list"}</h2>
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
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <HubPagination
            base={`/songs/camelot/${code.toLowerCase()}`}
            page={page}
            totalPages={totalPages}
            label={`Songs in Camelot ${code}, pagination`}
          />

          <p className="song-note">
            Camelot codes are derived from keys measured on official 30-second previews with
            TuneBad&rsquo;s in-browser engine. Have a track that is not here?{" "}
            <Link href="/key-bpm-finder">Analyze it yourself</Link> — free, no account, and your
            file never leaves your device.
          </p>

          <p className="song-related-all">
            <Link href="/songs">Browse all songs →</Link>
          </p>
        </article>
      </main>

      <MinimalFooter />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(listJsonLd) }} />
    </div>
  );
}
