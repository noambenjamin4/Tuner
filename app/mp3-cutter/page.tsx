import type { Metadata } from "next";
import { TunebadApp } from "@/components/TunebadApp";

export const metadata: Metadata = {
  title: "MP3 Cutter and Ringtone Maker",
  description:
    "Cut MP3, WAV, and other audio files in your browser. Trim a song to the part you want, add a fade, and save it as an MP3 or WAV. Free, no upload, no signup.",
  alternates: { canonical: "/mp3-cutter" },
  openGraph: { images: [{ url: "/og/mp3-cutter.png", width: 1200, height: 630 }] },
};

export default function Page() {
  return <TunebadApp initialView="cutter" />;
}
