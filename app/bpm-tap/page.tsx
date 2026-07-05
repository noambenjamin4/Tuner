import type { Metadata } from "next";
import { TunebadApp } from "@/components/TunebadApp";

export const metadata: Metadata = {
  title: "BPM Tap Tempo & Metronome",
  description:
    "Tap to find the BPM of any song, or use the free online metronome. Simple, accurate BPM counter, tap tempo, and metronome that run in your browser.",
  alternates: { canonical: "/bpm-tap" },
};

export default function Page() {
  return <TunebadApp initialView="bpm" />;
}
