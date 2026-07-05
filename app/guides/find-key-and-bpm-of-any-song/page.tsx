import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "@/components/guides/GuideShell";

const TITLE = "How to Find the Key and BPM of Any Song";
const DESCRIPTION =
  "Three free ways to find a song's key and BPM: paste a link, upload the audio file, or tap along. What the results mean and why half-time and double-time both count.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/guides/find-key-and-bpm-of-any-song" },
  openGraph: { images: [{ url: "/og/guide-key-bpm.png", width: 1200, height: 630 }] },
};

export default function Page() {
  return (
    <GuideShell
      title={TITLE}
      description={DESCRIPTION}
      path="/guides/find-key-and-bpm-of-any-song"
      datePublished="2026-07-05"
    >
      <h1 className="legal-title">{TITLE}</h1>
      <p className="legal-updated">Updated 2026-07-05</p>

      <p>
        Whether you want to rap over a beat, mix two tracks together, or figure out what to sample, the first two
        things you need are the tempo and the key. Here are three ways to get them, all free.
      </p>

      <h2>1. Paste a link</h2>
      <p>
        The fastest way. Open the <Link href="/key-bpm-finder">Key &amp; BPM Finder</Link> and paste a YouTube,
        Spotify, or SoundCloud link. TuneBad finds the song&rsquo;s official preview and analyzes the actual audio in
        your browser. If someone already looked the song up, you get the community result instantly.
      </p>

      <h2>2. Upload the file</h2>
      <p>
        For your own beats, demos, and anything unreleased, drop the audio file straight into the analyzer. The
        analysis runs on your device, so the file never gets uploaded anywhere. You get BPM, key, the Camelot code
        for mixing, energy, danceability, and loudness in a few seconds.
      </p>

      <h2>3. Tap it out</h2>
      <p>
        Old school but reliable: open the <Link href="/bpm-tap">tap tempo tool</Link> and tap any key along with the
        beat. After a few taps the average settles on the BPM. It works for anything you can hear, even a song
        playing in a store.
      </p>

      <h2>Why the analyzer shows two tempos</h2>
      <p>
        Plenty of songs can honestly be counted two ways. A trap beat at 140 BPM feels like 70 to some people, and
        both answers are correct: one hears the hi-hats, the other hears the snare. That&rsquo;s why TuneBad shows
        results like &ldquo;140 or 70&rdquo; and lets you pick the count that matches how you feel the track. If a
        result ever seems doubled or halved compared to what you expected, that&rsquo;s what happened.
      </p>

      <h2>What the key is for</h2>
      <p>
        The key tells you which notes and chords a song is built on. Two songs in the same key (or in compatible
        keys) blend naturally, which is why DJs care so much about it. The Camelot code next to the key makes
        compatibility trivial: match the number, or move one step, and it works. There&rsquo;s a full explanation in
        the <Link href="/guides/camelot-wheel-harmonic-mixing">Camelot wheel guide</Link>.
      </p>

      <h2>How accurate is this?</h2>
      <p>
        TuneBad runs on essentia, the same open-source audio engine behind many of the popular analyzers. Tempo
        detection is very reliable; key detection is right most of the time but no analyzer gets it perfect, because
        real songs modulate, borrow chords, and sit between keys on purpose. Treat the key as a strong starting
        point and trust your ears for the final call.
      </p>

      <p>
        Related: <Link href="/guides/what-is-lufs-streaming-loudness">What is LUFS?</Link> ·{" "}
        <Link href="/guides/how-to-make-slowed-and-reverb">How to make slowed + reverb</Link>
      </p>
    </GuideShell>
  );
}
