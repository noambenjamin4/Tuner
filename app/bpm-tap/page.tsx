import type { Metadata } from "next";
import { TunebadApp } from "@/components/TunebadApp";

export const metadata: Metadata = {
  title: "BPM Tap Tempo & Metronome",
  description:
    "Tap along to find the BPM of any song, or use the built-in metronome. A simple BPM counter, tap tempo, and metronome, all in your browser.",
  alternates: { canonical: "/bpm-tap" },
  openGraph: { images: [{ url: "/og/bpm-tap.png", width: 1200, height: 630 }] },
};

export default function Page() {
  return <TunebadApp initialView="bpm" />;
}
