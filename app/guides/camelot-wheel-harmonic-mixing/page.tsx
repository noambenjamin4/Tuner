import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "@/components/guides/GuideShell";

const TITLE = "The Camelot Wheel, Explained (Harmonic Mixing for DJs)";
const DESCRIPTION =
  "How the Camelot wheel works, the three moves that always sound good, and how to find any song's Camelot code for free.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/guides/camelot-wheel-harmonic-mixing" },
  openGraph: { images: [{ url: "/og/guide-camelot.png", width: 1200, height: 630 }] },
};

// 12 o'clock = position 12, going clockwise 1..12. Outer ring = major (B),
// inner ring = minor (A). Standard Camelot layout.
const WHEEL: { pos: number; major: string; minor: string }[] = [
  { pos: 1, major: "B", minor: "Abm" },
  { pos: 2, major: "F#", minor: "Ebm" },
  { pos: 3, major: "Db", minor: "Bbm" },
  { pos: 4, major: "Ab", minor: "Fm" },
  { pos: 5, major: "Eb", minor: "Cm" },
  { pos: 6, major: "Bb", minor: "Gm" },
  { pos: 7, major: "F", minor: "Dm" },
  { pos: 8, major: "C", minor: "Am" },
  { pos: 9, major: "G", minor: "Em" },
  { pos: 10, major: "D", minor: "Bm" },
  { pos: 11, major: "A", minor: "F#m" },
  { pos: 12, major: "E", minor: "Dbm" },
];

function polar(cx: number, cy: number, r: number, pos: number): { x: number; y: number } {
  // position 12 at the top, clockwise
  const angle = ((pos % 12) * 30 - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function CamelotWheelSvg() {
  const cx = 200;
  const cy = 200;
  return (
    <svg viewBox="0 0 400 400" role="img" aria-label="Camelot wheel: outer ring major keys 1B to 12B, inner ring minor keys 1A to 12A" className="guide-figure">
      <circle cx={cx} cy={cy} r={190} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={130} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={70} fill="none" stroke="currentColor" strokeWidth="1.5" />
      {WHEEL.map(({ pos }) => {
        const a = polar(cx, cy, 70, pos + 0.5);
        const b = polar(cx, cy, 190, pos + 0.5);
        return <line key={`sep-${pos}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" strokeWidth="0.75" opacity="0.5" />;
      })}
      {WHEEL.map(({ pos, major, minor }) => {
        const outer = polar(cx, cy, 160, pos);
        const inner = polar(cx, cy, 100, pos);
        return (
          <g key={pos} textAnchor="middle" fontFamily="var(--font-mono, monospace)">
            <text x={outer.x} y={outer.y - 2} fontSize="15" fontWeight="700" fill="currentColor">{`${pos}B`}</text>
            <text x={outer.x} y={outer.y + 14} fontSize="12" fill="currentColor" opacity="0.7">{major}</text>
            <text x={inner.x} y={inner.y - 1} fontSize="13" fontWeight="700" fill="currentColor">{`${pos}A`}</text>
            <text x={inner.x} y={inner.y + 13} fontSize="11" fill="currentColor" opacity="0.7">{minor}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Page() {
  return (
    <GuideShell
      title={TITLE}
      description={DESCRIPTION}
      path="/guides/camelot-wheel-harmonic-mixing"
      datePublished="2026-07-05"
    >
      <h1 className="legal-title">{TITLE}</h1>
      <p className="legal-updated">Updated 2026-07-05</p>

      <p>
        Harmonic mixing is the trick behind DJ sets that feel seamless: when two songs share compatible keys, they
        blend instead of clashing. The Camelot wheel turns music theory into a number and a letter, so you never
        have to think about circle-of-fifths relationships mid-set.
      </p>

      <CamelotWheelSvg />

      <h2>How to read it</h2>
      <p>
        Every key gets a code from 1 to 12, plus a letter: <strong>A for minor keys</strong> (inner ring),{" "}
        <strong>B for major keys</strong> (outer ring). A minor is 8A. C major is 8B. That&rsquo;s the whole system.
      </p>

      <h2>The three moves that always work</h2>
      <ul>
        <li>
          <strong>Same code:</strong> 8A into 8A. Same key, zero risk.
        </li>
        <li>
          <strong>One step around the wheel:</strong> 8A into 7A or 9A. Neighboring keys share almost all their
          notes, so the change feels fresh without clashing.
        </li>
        <li>
          <strong>Swap the letter:</strong> 8A into 8B. That&rsquo;s the relative major or minor, which shares every
          note. It shifts the mood from moody to bright (or back) while staying perfectly in tune.
        </li>
      </ul>
      <p>
        Break those rules on purpose sometimes; a jarring key change can be a moment. But if you want safe, those
        three moves are safe.
      </p>

      <h2>Finding a song's Camelot code</h2>
      <p>
        The <Link href="/key-bpm-finder">Key &amp; BPM Finder</Link> shows the Camelot code with every analysis.
        Paste a YouTube or Spotify link, or drop the audio file, and you get the key, the code, and the tempo
        together. It&rsquo;s free and the analysis runs in your browser.
      </p>

      <h2>One honest caveat</h2>
      <p>
        No analyzer detects keys perfectly, including this one. Songs modulate, producers detune things on purpose,
        and some tracks genuinely sit between two keys. If a blend sounds wrong despite matching codes, trust your
        ears over the wheel.
      </p>

      <p>
        Related: <Link href="/guides/find-key-and-bpm-of-any-song">How to find the key and BPM of any song</Link> ·{" "}
        <Link href="/guides/how-to-make-slowed-and-reverb">How to make slowed + reverb</Link>
      </p>
    </GuideShell>
  );
}
