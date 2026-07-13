import type { Metadata } from "next";
import { TunebadApp } from "@/components/TunebadApp";

export const metadata: Metadata = {
  title: "Frequency to Note Calculator — Hz to Pitch & Cents",
  description:
    "Convert any frequency in Hz to the nearest musical note, octave, and cents offset. A free frequency-to-pitch calculator that runs in your browser. To actually change a song's pitch, use the nightcore maker or slowed + reverb tool.",
  alternates: { canonical: "/pitch-shifter" },
  openGraph: { images: [{ url: "/og/pitch-shifter.png", width: 1200, height: 630 }] },
};

export default function Page() {
  return <TunebadApp initialView="pitch" />;
}
