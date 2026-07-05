import type { Metadata } from "next";
import { TunebadApp } from "@/components/TunebadApp";

export const metadata: Metadata = {
  title: "Song Key & BPM Finder",
  description:
    "Free online key and BPM finder. Upload an audio file to instantly detect the musical key, tempo (BPM), Camelot code, energy, and loudness of any song — right in your browser.",
  alternates: { canonical: "/key-bpm-finder" },
};

export default function Page() {
  return <TunebadApp initialView="analysis" />;
}
