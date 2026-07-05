import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "@/components/guides/GuideShell";

const TITLE = "What Is LUFS? Streaming Loudness, Explained Simply";
const DESCRIPTION =
  "Why Spotify and YouTube turn your track down, what LUFS actually measures, the loudness targets that matter in 2026, and how to check your own master for free.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/guides/what-is-lufs-streaming-loudness" },
  openGraph: { images: [{ url: "/og/guide-lufs.png", width: 1200, height: 630 }] },
};

export default function Page() {
  return (
    <GuideShell
      title={TITLE}
      description={DESCRIPTION}
      path="/guides/what-is-lufs-streaming-loudness"
      datePublished="2026-07-05"
    >
      <h1 className="legal-title">{TITLE}</h1>
      <p className="legal-updated">Updated 2026-07-05</p>

      <p>
        You spent hours making your master loud, uploaded it to Spotify, and it came out quieter than everyone
        else&rsquo;s track. Nothing is broken. That&rsquo;s loudness normalization doing its job, and LUFS is the
        unit it speaks.
      </p>

      <h2>LUFS in one paragraph</h2>
      <p>
        LUFS stands for Loudness Units relative to Full Scale. Unlike a peak meter, which only cares about the
        single loudest sample, LUFS measures how loud a track <em>feels</em> over time, weighted the way human ears
        actually hear. A whisper with one loud click has a high peak but a very low LUFS. A wall of distorted synths
        has a high LUFS even if it never technically clips.
      </p>

      <h2>Why streaming services turn tracks down</h2>
      <p>
        Every major platform plays all songs at roughly the same perceived loudness, so listeners don&rsquo;t reach
        for the volume knob between tracks. If your master is louder than the platform&rsquo;s reference level, it
        simply gets turned down. The crushed, brick-walled master that won the loudness war now just sounds flat and
        small at the same volume as everyone else, with none of its dynamics left.
      </p>

      <h2>The reference levels that matter</h2>
      <ul>
        <li>Spotify, YouTube, and TIDAL sit around -14 LUFS integrated.</li>
        <li>Apple Music uses roughly -16 LUFS with Sound Check.</li>
        <li>Deezer targets about -15 LUFS.</li>
      </ul>
      <p>
        That does not mean you must master at exactly -14 LUFS. Plenty of great releases land louder and take a
        small turn-down. The point is to know how much will be taken away, and to make that choice on purpose
        instead of by accident.
      </p>

      <h2>Check your track in 10 seconds</h2>
      <p>
        Drop your master into the free <Link href="/loudness">loudness checker</Link>. It measures the integrated
        LUFS and the true peak in your browser (the file never gets uploaded), then shows exactly how many dB each
        platform will turn your track down, per platform. If the penalty is bigger than you expected, ease off the
        limiter and let the mix breathe.
      </p>

      <h2>A sane target to start from</h2>
      <p>
        For most modern genres, a master around -9 to -11 LUFS with about 1 dB of true-peak headroom keeps
        competitive punch and survives normalization gracefully. Quieter genres can sit closer to -14 and keep all
        their dynamics. There is no single right number; there is only knowing your number.
      </p>

      <p>
        Related: <Link href="/guides/find-key-and-bpm-of-any-song">How to find the key and BPM of any song</Link> ·{" "}
        <Link href="/guides/camelot-wheel-harmonic-mixing">The Camelot wheel, explained</Link>
      </p>
    </GuideShell>
  );
}
