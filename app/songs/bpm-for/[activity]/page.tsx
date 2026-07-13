import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readAllSongs } from "@/lib/server/link-analysis";
import { ACTIVITIES, findActivity } from "@/lib/server/activities";

// Activity/tempo landing pages: /songs/bpm-for/running etc. A fixed,
// curated set of BPM windows for real search intents (running, workout,
// study music...), each backed by real analyzed songs in that range.
// English-only, like the other /songs hubs.
export const revalidate = 3600;

const SITE_URL = "https://www.tunebad.com";
// A hub page below this many songs is thin; the fixed activity list keeps
// this from ever firing today, but it's here as the catalog is still
// growing and some windows (sleep, yoga) start narrow.
const MIN_SONGS = 3;
const LIST_CAP = 300;

export function generateStaticParams() {
  return ACTIVITIES.map((a) => ({ activity: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ activity: string }>;
}): Promise<Metadata> {
  const { activity: slug } = await params;
  const activity = findActivity(slug);
  if (!activity) return { title: "Not found | TuneBad", robots: { index: false, follow: true } };
  return {
    title: `${activity.min}-${activity.max} BPM Songs for ${activity.label}`,
    description: `Songs at ${activity.min}-${activity.max} BPM for ${activity.label.toLowerCase()}, picked from real analyzed tracks with their exact BPM and key.`,
    alternates: { canonical: `/songs/bpm-for/${activity.slug}` },
  };
}

export default async function ActivityBpmPage({ params }: { params: Promise<{ activity: string }> }) {
  const { activity: slug } = await params;
  const activity = findActivity(slug);
  if (!activity) notFound();

  // One full-catalog read powers both the song list and the "specific BPM
  // hub" links below — cached by Next's Data Cache (revalidate 3600), same
  // pattern /songs and the sitemap "hubs" shard already rely on.
  const allSongs = await readAllSongs(50000);
  const songs = allSongs.filter((s) => s.bpm >= activity.min && s.bpm <= activity.max);
  if (songs.length < MIN_SONGS) notFound();

  // Specific BPM hub pages worth linking to: the ±2 window the /songs/bpm/[n]
  // route itself requires (see MIN_SONGS there), computed from the full
  // catalog so a link here never points at a thin/404 hub.
  const bpmCounts = new Map<number, number>();
  for (const s of allSongs) {
    const b = Math.round(s.bpm);
    for (let n = b - 2; n <= b + 2; n += 1) bpmCounts.set(n, (bpmCounts.get(n) ?? 0) + 1);
  }
  const bpmLinks = [...bpmCounts.entries()]
    .filter(([bpm, count]) => bpm >= activity.min && bpm <= activity.max && count >= 3)
    .sort((a, b) => a[0] - b[0])
    .map(([bpm]) => bpm)
    .slice(0, 20);

  const faqs = [
    {
      q: `What BPM is good for ${activity.label.toLowerCase()}?`,
      a: activity.blurb,
    },
    {
      q: "How were these songs picked?",
      a: `Every song listed here was analyzed from an official 30-second preview with TuneBad's in-browser key and BPM engine, then filtered to the ${activity.min}-${activity.max} BPM window. Tempo is only part of the picture — genre, energy, and lyrics matter too, so treat this as a starting pool, not a definitive ranking.`,
    },
  ];

  const listJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Songs at ${activity.min}-${activity.max} BPM for ${activity.label}`,
    numberOfItems: songs.length,
    itemListElement: songs.slice(0, 50).map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/song/${s.slug}`,
      name: s.artist ? `${s.title} by ${s.artist}` : s.title,
    })),
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
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
          <p className="song-crumb">
            <Link href="/songs">Songs</Link> / {activity.label}
          </p>
          <h1 className="song-title">
            Songs at {activity.min}-{activity.max} BPM for {activity.label}
          </h1>
          <p className="song-lede">
            {songs.length} analyzed {songs.length === 1 ? "song" : "songs"} between {activity.min} and{" "}
            {activity.max} BPM. {activity.blurb}
          </p>

          {bpmLinks.length > 0 && (
            <section className="song-section">
              <h2>Browse a specific tempo</h2>
              <ul className="song-keychips">
                {bpmLinks.map((bpm) => (
                  <li key={bpm}>
                    <Link href={`/songs/bpm/${bpm}`} className="song-keychip-rel">
                      {bpm} BPM
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="song-section">
            <h2>The list</h2>
            {songs.length > LIST_CAP && (
              <p className="song-note">
                Showing the first {LIST_CAP} of {songs.length} matching songs. Narrow the range with{" "}
                <Link href="/songs">the full database</Link> or a specific BPM link above.
              </p>
            )}
            <ul className="song-index">
              {songs.slice(0, LIST_CAP).map((s) => (
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

          <section className="song-section">
            <h2>Common questions</h2>
            {faqs.map((f) => (
              <details key={f.q} className="seo-faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </section>

          <p className="song-note">
            Tempos are measured from official 30-second previews with TuneBad&rsquo;s in-browser
            engine. Not sure of a track&rsquo;s BPM? <Link href="/key-bpm-finder">Analyze it</Link>{" "}
            or <Link href="/bpm-tap">tap it out</Link> — both free, no account.
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
    </div>
  );
}
