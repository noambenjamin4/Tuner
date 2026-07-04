import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "TuneBad — Music Utility";

const logoBase64 = readFileSync(join(process.cwd(), "public", "logo-dark.png")).toString("base64");
const logoDataUri = `data:image/png;base64,${logoBase64}`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoDataUri} width={360} height={360} alt="" style={{ objectFit: "contain" }} />
        <div
          style={{
            marginTop: 20,
            fontSize: 140,
            fontWeight: 900,
            letterSpacing: -3,
            color: "#ffffff",
            lineHeight: 1,
          }}
        >
          TUNEBAD
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 32,
            fontWeight: 500,
            letterSpacing: 2,
            color: "#9a9a9a",
            textTransform: "uppercase",
          }}
        >
          BPM &middot; Key &middot; Loudness &middot; Delay
        </div>
      </div>
    ),
    { ...size },
  );
}
