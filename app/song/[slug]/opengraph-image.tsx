import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readAnalysisBySlug } from "@/lib/server/link-analysis";

// Per-song share card. When a /song/<slug> link is posted to Discord, iMessage,
// Twitter, etc., this renders a branded 1200x630 image with the track's key,
// BPM, and Camelot instead of a generic site thumbnail.
//
// The font is read from disk (not fetch(new URL(...))): webpack rewrites that
// URL to a bare asset path fetch() cannot parse, on either runtime. The font
// lives in a private app/_og folder and is force-bundled via
// outputFileTracingIncludes in next.config.mjs so this read works on Vercel.
export const runtime = "nodejs";
export const alt = "Song key, BPM, and Camelot on TuneBad";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Read LAZILY, inside the handler. This module's exports (size/alt/contentType)
// are evaluated during ordinary /song/[slug] PAGE renders too, and the font is
// only guaranteed in this route's serverless bundle — a module-scope read
// crashed every on-demand page render with ENOENT once the song count outgrew
// the prerender set.
let cachedFont: Buffer | null = null;
function loadFont(): Buffer {
  if (!cachedFont) cachedFont = readFileSync(join(process.cwd(), "app/_og/Display-Bold.ttf"));
  return cachedFont;
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const font = loadFont();
  const song = await readAnalysisBySlug(slug);

  const title = song?.title ?? "TuneBad";
  const artist = song?.artist ?? "";
  const bpm = song ? `${Math.round(song.bpm)}` : "";
  const key = song?.key ?? "";
  const camelot = song?.camelot ?? "";

  const Pill = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 24, color: "#8a8a8a", letterSpacing: 2 }}>{label}</div>
      <div style={{ fontSize: 64, color: "#ffffff" }}>{value}</div>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0a0a",
          padding: 72,
          fontFamily: "Display",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* Vinyl mark drawn with nested divs (no font glyph, so no tofu box). */}
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 999,
              background: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ width: 16, height: 16, borderRadius: 999, background: "#0a0a0a" }} />
          </div>
          <div style={{ fontSize: 36, color: "#ffffff", letterSpacing: 2 }}>TUNEBAD</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 84, color: "#ffffff", lineHeight: 1.05 }}>
            {title.length > 42 ? title.slice(0, 40) + "…" : title}
          </div>
          {artist ? <div style={{ fontSize: 40, color: "#8a8a8a" }}>{artist}</div> : null}
        </div>

        <div style={{ display: "flex", gap: 72 }}>
          {key ? <Pill label="KEY" value={key} /> : null}
          {bpm ? <Pill label="BPM" value={bpm} /> : null}
          {camelot ? <Pill label="CAMELOT" value={camelot} /> : null}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Display", data: await font, weight: 700, style: "normal" }],
    },
  );
}
