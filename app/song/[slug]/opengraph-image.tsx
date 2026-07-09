import { ImageResponse } from "next/og";
import { readAnalysisBySlug } from "@/lib/server/link-analysis";

// Per-song share card. When a /song/<slug> link is posted to Discord, iMessage,
// Twitter, etc., this renders a branded 1200x630 image with the track's key,
// BPM, and Camelot instead of a generic site thumbnail.
export const runtime = "nodejs";
export const alt = "Song key, BPM, and Camelot on TuneBad";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Colocated font read via import.meta.url — the pattern Next traces reliably
// into the serverless bundle (a process.cwd() path is not always included).
async function loadFont(): Promise<ArrayBuffer> {
  return fetch(new URL("./Baloo2-Bold.ttf", import.meta.url)).then((r) => r.arrayBuffer());
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [song, font] = await Promise.all([readAnalysisBySlug(slug), loadFont()]);

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
          fontFamily: "Baloo",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 999,
              background: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0a0a0a",
              fontSize: 26,
            }}
          >
            ●
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
      fonts: [{ name: "Baloo", data: font, weight: 700, style: "normal" }],
    },
  );
}
