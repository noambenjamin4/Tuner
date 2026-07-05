import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "@/components/guides/GuideShell";

const TITLE = "How to Make a Slowed + Reverb Edit (Free, in Your Browser)";
const DESCRIPTION =
  "The settings behind the slowed + reverb sound, how to make your own edit in about a minute, and how to do nightcore with the same tool.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/guides/how-to-make-slowed-and-reverb" },
  openGraph: { images: [{ url: "/og/guide-slowed.png", width: 1200, height: 630 }] },
};

export default function Page() {
  return (
    <GuideShell
      title={TITLE}
      description={DESCRIPTION}
      path="/guides/how-to-make-slowed-and-reverb"
      datePublished="2026-07-05"
    >
      <h1 className="legal-title">{TITLE}</h1>
      <p className="legal-updated">Updated 2026-07-05</p>

      <p>
        Slowed + reverb is that hazy, underwater remix style that took over YouTube and TikTok: the song plays
        slower, the pitch drops with it, and a long reverb tail fills the space. It sounds like a mood because it
        is one. Here is exactly how to make your own.
      </p>

      <h2>The recipe</h2>
      <ul>
        <li>
          <strong>Speed: 0.75x to 0.85x.</strong> The classic zone. Slower than 0.75x starts to smear; 0.8x is the
          sweet spot most edits use.
        </li>
        <li>
          <strong>Let the pitch drop.</strong> The deep, dragged-down vocal is the signature of the genre. It comes
          free with the slowdown, so leave pitch correction off.
        </li>
        <li>
          <strong>Reverb: 30% to 50%.</strong> Enough to feel like a big empty room, not so much that the drums
          disappear.
        </li>
        <li>
          <strong>A touch of bass boost</strong> if the slowdown thinned the low end out.
        </li>
      </ul>

      <h2>Make one in about a minute</h2>
      <p>
        Open the free <Link href="/slowed-reverb">Slowed + Reverb studio</Link>, drop in an audio file, and hit the
        Slowed + Reverb preset. Everything runs in your browser, so nothing gets uploaded. Fine-tune the sliders
        while it plays, then export as MP3 or WAV when it sounds right.
      </p>

      <h2>Nightcore is the same trick, reversed</h2>
      <p>
        Speed up instead: around 1.2x to 1.3x, no reverb, pitch riding up with the tempo. The studio has a Nightcore
        preset for exactly this.
      </p>

      <h2>Two things worth knowing</h2>
      <p>
        First, start from the highest quality file you have. Slowing audio down stretches every flaw, so a crunchy
        128 kbps rip gets crunchier. Second, if you plan to post your edit anywhere, remember the original song
        belongs to its rights holders. Editing a track for yourself is one thing; publishing it is a licensing
        question. The <Link href="/copyright">copyright page</Link> covers where TuneBad stands.
      </p>

      <h2>Bonus: match the tempo to your project</h2>
      <p>
        Making an edit to rap or sing over? Check the slowed tempo with the{" "}
        <Link href="/key-bpm-finder">Key &amp; BPM Finder</Link>: analyze your exported file and you get the new BPM
        and key, ready for your DAW session. If you only need part of the song, trim it first with the{" "}
        <Link href="/mp3-cutter">MP3 cutter</Link>.
      </p>

      <p>
        Related: <Link href="/guides/find-key-and-bpm-of-any-song">How to find the key and BPM of any song</Link> ·{" "}
        <Link href="/guides/what-is-lufs-streaming-loudness">What is LUFS?</Link>
      </p>
    </GuideShell>
  );
}
