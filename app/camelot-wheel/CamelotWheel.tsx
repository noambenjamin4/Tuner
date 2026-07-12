"use client";

// Interactive Camelot wheel: 24 clickable segments (inner ring 1A-12A minor,
// outer ring 1B-12B major). Selecting a code highlights its harmonic
// neighbors and shows the musical key with links into the song database.
// English-only, like the rest of the /camelot-wheel page. Strictly
// monochrome: only var(--ink) / var(--line) / var(--surface).
import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { camelot } from "@/lib/audio/constants";
import { camelotNeighbors, compatibleCodes, keyToSlug, relationLabel } from "@/lib/audio/harmonic";

// Invert the canonical key→code table from lib/audio/constants.ts, so the
// wheel can never drift from what the analyzer reports.
const CODE_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(camelot).map(([key, code]) => [code, key]),
);

/** "A Minor" -> "Am", "F# Major" -> "F#" (short in-segment label). */
function shortKey(key: string): string {
  const [tonic, scale] = key.split(" ");
  return scale === "Minor" ? `${tonic}m` : tonic;
}

const CX = 240;
const CY = 240;
// Ring radii: center hole, inner (minor/A) ring, outer (major/B) ring.
const R_HOLE = 78;
const R_MID = 152;
const R_OUT = 228;

function point(r: number, angleDeg: number): [number, number] {
  const a = (angleDeg - 90) * (Math.PI / 180);
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

/** Annular-sector path for one wheel segment. */
function segmentPath(r0: number, r1: number, a0: number, a1: number): string {
  const [x0, y0] = point(r1, a0);
  const [x1, y1] = point(r1, a1);
  const [x2, y2] = point(r0, a1);
  const [x3, y3] = point(r0, a0);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r1} ${r1} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)} A ${r0} ${r0} 0 0 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`;
}

// Segment order: hour position n sits centered at (n mod 12) * 30 degrees
// from 12 o'clock, matching the standard Camelot layout.
const SEGMENTS: { code: string; ring: "A" | "B"; n: number }[] = [];
for (let n = 1; n <= 12; n += 1) {
  SEGMENTS.push({ code: `${n}A`, ring: "A", n });
  SEGMENTS.push({ code: `${n}B`, ring: "B", n });
}

export function CamelotWheel() {
  const [selected, setSelected] = useState("8A");
  const neighborSet = new Set(camelotNeighbors(selected));
  const compatible = compatibleCodes(selected);
  const selectedKey = CODE_TO_KEY[selected];

  const onKeyDown = (event: KeyboardEvent<SVGGElement>, code: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelected(code);
    }
  };

  return (
    <div className="cw-interactive">
      <svg
        viewBox="0 0 480 480"
        className="cw-wheel"
        role="group"
        aria-label="Interactive Camelot wheel. Inner ring: minor keys 1A to 12A. Outer ring: major keys 1B to 12B. Select a segment to see its key and compatible codes."
      >
        {SEGMENTS.map(({ code, ring, n }) => {
          const a0 = (n % 12) * 30 - 15;
          const a1 = (n % 12) * 30 + 15;
          const [r0, r1] = ring === "A" ? [R_HOLE, R_MID] : [R_MID, R_OUT];
          const labelR = ring === "A" ? (R_HOLE + R_MID) / 2 : (R_MID + R_OUT) / 2;
          const [lx, ly] = point(labelR, (n % 12) * 30);
          const isSelected = code === selected;
          const isNeighbor = !isSelected && neighborSet.has(code);
          const keyName = CODE_TO_KEY[code];
          return (
            <g
              key={code}
              className={`cw-seg${isSelected ? " is-selected" : ""}${isNeighbor ? " is-neighbor" : ""}`}
              tabIndex={0}
              role="button"
              aria-pressed={isSelected}
              aria-label={`${code}, ${keyName}${isNeighbor ? ", compatible with " + selected : ""}`}
              onClick={() => setSelected(code)}
              onKeyDown={(event) => onKeyDown(event, code)}
            >
              <path
                d={segmentPath(r0, r1, a0, a1)}
                fill={isSelected ? "var(--ink)" : "var(--surface)"}
                stroke="var(--line)"
                strokeWidth="1.5"
              />
              {isNeighbor ? (
                <path d={segmentPath(r0, r1, a0, a1)} fill="var(--ink)" fillOpacity="0.12" stroke="var(--ink)" strokeWidth="1.5" pointerEvents="none" />
              ) : null}
              <text
                x={lx}
                y={ly - 4}
                textAnchor="middle"
                fontSize={ring === "A" ? 17 : 19}
                fontWeight={700}
                fill={isSelected ? "var(--surface)" : "var(--ink)"}
                pointerEvents="none"
              >
                {code}
              </text>
              <text
                x={lx}
                y={ly + 14}
                textAnchor="middle"
                fontSize={ring === "A" ? 12 : 13}
                fill={isSelected ? "var(--surface)" : "var(--ink)"}
                opacity={0.7}
                pointerEvents="none"
              >
                {shortKey(keyName)}
              </text>
            </g>
          );
        })}
        <text x={CX} y={CY - 4} textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--ink)">
          {selected}
        </text>
        <text x={CX} y={CY + 16} textAnchor="middle" fontSize="12" fill="var(--ink)" opacity="0.7">
          {shortKey(selectedKey)}
        </text>
      </svg>

      <div className="cw-panel" aria-live="polite">
        <p className="cw-panel-code">{selected}</p>
        <h2 className="cw-panel-key">{selectedKey}</h2>
        <p className="cw-panel-help">
          Tracks in {selectedKey} ({selected}) mix cleanly with these codes:
        </p>
        <ul className="cw-chips">
          {compatible.map((code) => (
            <li key={code}>
              <button type="button" className="cw-chip" onClick={() => setSelected(code)}>
                <strong>{code}</strong> {CODE_TO_KEY[code]}
                <span className="cw-chip-relation">{relationLabel(selected, code)}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="cw-panel-links">
          <Link href={`/songs/key/${keyToSlug(selectedKey)}`} className="song-cta-button">
            Songs in {selectedKey}
          </Link>
        </p>
      </div>
    </div>
  );
}
