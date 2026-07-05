import type { Metadata } from "next";
import { TunebadApp } from "@/components/TunebadApp";

export const metadata: Metadata = {
  title: "Loudness Penalty & LUFS Meter",
  description:
    "Free LUFS loudness meter. Check your track's loudness and see how much Spotify, Apple Music, YouTube, TIDAL, Amazon, and Deezer will turn it down.",
  alternates: { canonical: "/loudness" },
};

export default function Page() {
  return <TunebadApp initialView="loudness" />;
}
