import type { Metadata } from "next";
import { TunebadApp } from "@/components/TunebadApp";

export const metadata: Metadata = {
  title: "YouTube & Spotify to MP3 Converter",
  description:
    "Convert YouTube, Spotify, and SoundCloud links to MP3, WAV, or MP4. Free online audio converter and downloader — no signup, runs in your browser.",
  alternates: { canonical: "/converter" },
};

export default function Page() {
  return <TunebadApp initialView="converter" />;
}
