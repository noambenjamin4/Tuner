import type { Metadata } from "next";
import { TunebadApp } from "@/components/TunebadApp";

export const metadata: Metadata = {
  title: "YouTube & Spotify to MP3 Converter",
  description:
    "Turn YouTube, Spotify, and SoundCloud links into MP3, WAV, or MP4 files. Free to use, no sign-up, and it all runs in your browser.",
  alternates: { canonical: "/converter" },
};

export default function Page() {
  return <TunebadApp initialView="converter" />;
}
