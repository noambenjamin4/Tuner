import Link from "next/link";
import { notFound } from "next/navigation";
import { countSongsByKey, readSongsByKey } from "@/lib/server/link-analysis";
import { keyToSlug, slugToKey, compatibleCodes, relationLabel } from "@/lib/audio/harmonic";
import { camelot } from "@/lib/audio/constants";
import { MinimalFooter } from "@/components/layout/MinimalFooter";
import { HUB_PAGE_SIZE, HubPagination, hubHref } from "@/components/songs/HubPagination";
import { SITE_URL } from "@/lib/site";

// Shared renderer for /songs/key/<slug> (page 1) and /songs/key/<slug>/page/<n>.
//
// WHY PAGINATION EXISTS: every hub reader is `order=created_at.desc&limit=300`,
// so all 24 key hubs returned overlapping slices of the same newest songs. The
// union of every hub + /songs reached only ~9,300 of 118,000+ song pages —
// ~92% had zero internal inbound links and were reachable by sitemap alone.
// Walking the whole set with offset pages is what makes them reachable: ~5k
// songs per key / PAGE_SIZE ≈ 17 pages per key, 24 keys ≈ 400 hub pages that
// together link every song.
export const PAGE_SIZE = HUB_PAGE_SIZE;

/** Page 1 lives at the bare hub URL; page N at /page/N. */
export function keyHubHref(slug: string, page: number): string {
  return hubHref(`/songs/key/${slug}`, page);
}

export function keyHubMeta(slug: string, page: number) {
  const key = slugToKey(slug);
  if (!key) return null;
  const code = camelot[key];
  const suffix = page > 1 ? ` — Page ${page}` : "";
  return {
    key,
    code,
    title: `Songs in ${key} (Camelot ${code}) — Key & BPM List${suffix}`,
    description:
      page > 1
        ? `More songs in the key of ${key}, Camelot ${code}, with the BPM of each track. Page ${page}.`
        : `A list of songs in the key of ${key}, Camelot ${code}, with the BPM of each track. Useful for DJs building harmonic sets and producers hunting samples in ${key}.`,
    // Each page self-canonicals: they hold DIFFERENT songs, so pointing them
    // all at page 1 would tell Google to drop the very pages that carry the
    // links to the long tail.
    canonical: keyHubHref(slug, page),
  };
}

export async function KeyHubPage({ slug, page }: { slug: string; page: number }) {
  const key = slugToKey(slug);
  if (!key) notFound();

  const [songs, total] = await Promise.all([
    readSongsByKey(key, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    countSongsByKey(key),
  ]);
  if (songs.length === 0) notFound();

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const code = camelot[key];
  const compat = compatibleCodes(code);
  const compatKeys = compat
    .map((c) => {
      const k = (Object.entries(camelot).find(([, v]) => v === c) ?? [])[0];
      return k ? { key: k, code: c, rel: relationLabel(code, c) } : null;
    })
    .filter((x): x is { key: string; code: string; rel: string } => x !== null);

  const listJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: page > 1 ? `Songs in ${key} — page ${page}` : `Songs in ${key}`,
    numberOfItems: songs.length,
    itemListElement: songs.slice(0, 50).map((s, i) => ({
      "@type": "ListItem",
      position: (page - 1) * PAGE_SIZE + i + 1,
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
            <Link href="/songs">Songs</Link> / {page > 1 ? <Link href={keyHubHref(slug, 1)}>{key}</Link> : key}
            {page > 1 ? ` / Page ${page}` : ""}
          </p>
          <h1 className="song-title">
            Songs in {key}
            {page > 1 ? ` — page ${page}` : ""}
          </h1>
          <p className="song-lede">
            {total} analyzed {total === 1 ? "song" : "songs"} in the key of <strong>{key}</strong>,
            Camelot <strong>{code}</strong>. On the Camelot wheel, tracks in {code} mix cleanly with{" "}
            {compat.join(", ")} — so this list is a starting pool for harmonic sets around {key}.
          </p>

          {compatKeys.length > 0 && (
            <section className="song-section">
              <h2>Keys that mix with {key}</h2>
              <ul className="song-keychips">
                {compatKeys.map((k) => (
                  <li key={k.code}>
                    <span className="song-keychip">{k.code}</span>
                    <Link href={`/songs/key/${keyToSlug(k.key)}`} className="song-keychip-rel">
                      {k.key} ({k.rel})
                    </Link>
                  </li>
                ))}
              </ul>
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
                      {Math.round(s.bpm)} BPM{s.camelot ? ` · ${s.camelot}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <HubPagination
            base={`/songs/key/${slug}`}
            page={page}
            totalPages={totalPages}
            label={`Songs in ${key}, pagination`}
          />

          <p className="song-note">
            Keys are measured from official 30-second previews with TuneBad&rsquo;s in-browser engine.
            Have a track that is not here? <Link href="/key-bpm-finder">Analyze it yourself</Link> — free,
            no account, and your file never leaves your device. To understand the wheel, read the{" "}
            <Link href="/guides/camelot-wheel-harmonic-mixing">Camelot wheel guide</Link>.
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
