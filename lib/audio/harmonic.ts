// Camelot-wheel harmonic mixing helpers. The wheel places the 24 keys on a
// clock (1-12) with an inner ring "A" (minor) and outer ring "B" (major). Two
// tracks mix smoothly when their Camelot codes are the same, one step around
// the wheel, or the relative major/minor (same number, other letter).

export type CamelotCode = string; // e.g. "8B", "11A"

function parse(code: string): { n: number; letter: "A" | "B" } | null {
  const m = /^(1[0-2]|[1-9])([AB])$/.exec(code.trim().toUpperCase());
  if (!m) return null;
  return { n: Number(m[1]), letter: m[2] as "A" | "B" };
}

const wrap = (n: number): number => ((n - 1 + 12) % 12) + 1;

/**
 * The classic compatible-mix set for a Camelot code, in DJ-friendly order:
 * same key, energy up (+1), energy down (-1), and the relative major/minor.
 * Returns [] for an unknown code.
 */
export function camelotNeighbors(code: string): CamelotCode[] {
  const p = parse(code);
  if (!p) return [];
  return [
    `${p.n}${p.letter}`,
    `${wrap(p.n + 1)}${p.letter}`,
    `${wrap(p.n - 1)}${p.letter}`,
    `${p.n}${p.letter === "A" ? "B" : "A"}`,
  ];
}

/** Compatible codes excluding the track's own key (for "mix it with" lists). */
export function compatibleCodes(code: string): CamelotCode[] {
  const p = parse(code);
  if (!p) return [];
  return camelotNeighbors(code).filter((c) => c !== `${p.n}${p.letter}`);
}

/** Plain-language label for how a neighbor relates to the source key. */
export function relationLabel(fromCode: string, toCode: string): string {
  const a = parse(fromCode);
  const b = parse(toCode);
  if (!a || !b) return "compatible";
  if (a.n === b.n && a.letter === b.letter) return "same key";
  if (a.n === b.n) return a.letter === "A" ? "relative major" : "relative minor";
  if (wrap(a.n + 1) === b.n) return "energy boost";
  if (wrap(a.n - 1) === b.n) return "energy drop";
  return "compatible";
}
