import type { Metadata } from "next";
import { TunebadApp } from "@/components/TunebadApp";

export const metadata: Metadata = {
  title: "Slowed + Reverb Maker",
  description:
    "Make a slowed and reverb version of any song, or speed it up for a nightcore edit. Set the speed, pitch, and reverb, then export it. Free, right in your browser.",
  alternates: { canonical: "/slowed-reverb" },
};

export default function Page() {
  return <TunebadApp initialView="remix" />;
}
