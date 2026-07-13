"use client";

/* Minimalist monochrome line icons — decorative only (no user-facing text).
   Shared shape: viewBox 0 0 24 24, stroke=currentColor, no fill, rounded caps/joins.
   Kept under ~6 primitives each so they stay crisp at 20px. */

export interface IconProps {
  size?: number;
  className?: string;
}

const BASE_SVG_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": "true" as const,
};

/** A few vertical bars of varying height — file analysis / waveform. */
export function WaveformIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...BASE_SVG_PROPS} width={size} height={size} className={className}>
      <line x1="4" y1="9" x2="4" y2="15" />
      <line x1="9" y1="5" x2="9" y2="19" />
      <line x1="14" y1="2" x2="14" y2="22" />
      <line x1="19" y1="7" x2="19" y2="17" />
    </svg>
  );
}

/** Trapezoid body with a pendulum line — BPM / metronome. */
export function MetronomeIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...BASE_SVG_PROPS} width={size} height={size} className={className}>
      <path d="M8 21h8L14.5 4h-5L8 21Z" />
      <line x1="9.5" y1="21" x2="14.5" y2="21" />
      <line x1="12" y1="6" x2="15.5" y2="16" />
      <circle cx="12" cy="4" r="1" />
    </svg>
  );
}

/** Two-prong fork — pitch / tuning. */
export function TuningForkIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...BASE_SVG_PROPS} width={size} height={size} className={className}>
      <path d="M9 3v8a3 3 0 0 0 6 0V3" />
      <line x1="9" y1="3" x2="9" y2="8" />
      <line x1="15" y1="3" x2="15" y2="8" />
      <line x1="12" y1="14" x2="12" y2="21" />
    </svg>
  );
}

/** Nested concentric arcs — echo / delay / reverb. */
export function EchoIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...BASE_SVG_PROPS} width={size} height={size} className={className}>
      <path d="M6 17a7 7 0 0 1 0-10" />
      <path d="M3 19a11 11 0 0 1 0-14" />
      <circle cx="16" cy="12" r="2.5" />
      <path d="M16 12h0" />
    </svg>
  );
}

/** Semicircle dial with a needle — loudness gauge. */
export function GaugeIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...BASE_SVG_PROPS} width={size} height={size} className={className}>
      <path d="M4 16a8 8 0 0 1 16 0" />
      <line x1="12" y1="16" x2="16" y2="10" />
      <circle cx="12" cy="16" r="1" />
    </svg>
  );
}

/** Clock-like dial with a speed hand — slowed + reverb. */
export function SlowedIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...BASE_SVG_PROPS} width={size} height={size} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <line x1="12" y1="12" x2="12" y2="7" />
      <line x1="12" y1="12" x2="15" y2="14" />
    </svg>
  );
}

/** Down arrow into a tray — converter / download. */
export function DownloadIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...BASE_SVG_PROPS} width={size} height={size} className={className}>
      <line x1="12" y1="3" x2="12" y2="14" />
      <path d="M8 10l4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

/** Open book / logbook — history. */
export function HistoryIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...BASE_SVG_PROPS} width={size} height={size} className={className}>
      <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
      <line x1="5.5" y1="8.5" x2="8.5" y2="8.5" />
      <line x1="5.5" y1="12" x2="8.5" y2="12" />
    </svg>
  );
}
