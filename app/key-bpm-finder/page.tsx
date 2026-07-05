import type { Metadata } from "next";
import { TunebadApp } from "@/components/TunebadApp";

export const metadata: Metadata = {
  title: "Song Key & BPM Finder",
  description:
    "Free key and BPM finder. Drop in an audio file and get the key, tempo, Camelot code, energy, and loudness of any song, right in your browser.",
  alternates: { canonical: "/key-bpm-finder" },
};

export default function Page() {
  return <TunebadApp initialView="analysis" />;
}
