import type { Metadata } from "next";
import { TunebadApp } from "@/components/TunebadApp";

export const metadata: Metadata = {
  title: "Loudness Penalty & LUFS Meter",
  description:
    "Free LUFS loudness meter. Measure your track's integrated loudness and see the loudness penalty for Spotify, Apple Music, YouTube, TIDAL, Amazon and Deezer.",
  alternates: { canonical: "/loudness" },
};

export default function Page() {
  return <TunebadApp initialView="loudness" />;
}
