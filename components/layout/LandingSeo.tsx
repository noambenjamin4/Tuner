// Homepage-only SEO + positioning section. Renders below the tool (below the
// fold) so it never clutters the tool-first UI, but gives Google indexable
// content, the free/no-ads/no-sign-up angle, and an FAQ that's eligible for
// rich results (matching FAQPage JSON-LD below, content visible).

const VALUES: { title: string; body: string }[] = [
  { title: "100% free", body: "Every tool is free to use. No trial, no paywall, nothing to upgrade." },
  { title: "No ads, no sign-up", body: "You don't need an account, and nothing pops up to get in the way." },
  { title: "Stays on your device", body: "The analysis runs in your browser, so your files never get uploaded." },
  { title: "All in one place", body: "Key and BPM, the converter, loudness, slowed + reverb, pitch, and delay times." },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "How do I find the key and BPM of a song?",
    a: "Open the Key & BPM Finder and drop in an audio file. In a few seconds you get the key, tempo, Camelot code, and loudness. No account needed.",
  },
  {
    q: "Is TuneBad free?",
    a: "Yes, completely. No ads, no account, and nothing hidden behind a paywall.",
  },
  {
    q: "Can I convert a YouTube or Spotify link to MP3?",
    a: "Yes. Paste a YouTube, Spotify, or SoundCloud link into the Converter and save it as an MP3, WAV, or MP4. Please keep it to personal use.",
  },
  {
    q: "Does my audio get uploaded to a server?",
    a: "No. When you analyze a track, that happens right in your browser, so the file never leaves your device.",
  },
  {
    q: "How accurate is the BPM and key detection?",
    a: "It runs on essentia, the same engine behind a lot of the popular tools. Plenty of songs can be read at two tempos (say 85 or 170), so TuneBad shows both and lets you pick the one that feels right.",
  },
  {
    q: "What is slowed + reverb?",
    a: "It's that dreamy, spaced-out remix style where a track is slowed down with a lot of reverb on top. You can make one in the Slowed + Reverb studio and export it when it sounds right.",
  },
];

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export function LandingSeo() {
  return (
    <section className="seo-landing" aria-label="About TuneBad">
      <div className="seo-inner">
        <h2 className="seo-heading">Free tools for producers and DJs</h2>
        <p className="seo-lede">
          TuneBad is a free set of tools for anyone who works with music. Find a song&rsquo;s key, BPM, and loudness,
          turn a YouTube or Spotify link into an MP3, slow a track down and add reverb, change the pitch, or work out
          delay times for your mix. It all runs in your browser, with no ads and no account.
        </p>

        <ul className="seo-values">
          {VALUES.map((v) => (
            <li key={v.title} className="seo-value">
              <h3>{v.title}</h3>
              <p>{v.body}</p>
            </li>
          ))}
        </ul>

        <h2 className="seo-heading seo-heading-faq">Frequently asked questions</h2>
        <div className="seo-faq">
          {FAQS.map((f) => (
            <details key={f.q} className="seo-faq-item">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />
    </section>
  );
}
