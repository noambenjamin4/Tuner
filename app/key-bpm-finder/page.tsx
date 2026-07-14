import type { Metadata } from "next";
import { TunebadApp } from "@/components/TunebadApp";

export const metadata: Metadata = {
  title: "Song Key & BPM Finder",
  description:
    "Free key and BPM finder. Paste a YouTube, Spotify, or SoundCloud link, or drop an audio file, and get the key, tempo, Camelot code, and loudness of any song.",
  // Canonical to "/" — this route renders the SAME <TunebadApp> on the same
  // view, so the two pages were self-canonical duplicates competing for the
  // site's head term ("key and bpm finder"), and this is the weaker twin (no
  // LandingSeo, no FAQPage JSON-LD). The route stays: it's the analyzer's real
  // URL, linked from the nav and written to the address bar on tab switch.
  alternates: { canonical: "/" },
  openGraph: { images: [{ url: "/og/key-bpm-finder.png", width: 1200, height: 630 }] },
};

export default function Page() {
  return <TunebadApp initialView="analysis" />;
}
