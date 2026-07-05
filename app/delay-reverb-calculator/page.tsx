import type { Metadata } from "next";
import { TunebadApp } from "@/components/TunebadApp";

export const metadata: Metadata = {
  title: "Delay & Reverb Time Calculator",
  description:
    "Free delay and reverb time calculator. Get exact delay times in milliseconds and Hz for any BPM — 1/1 to 1/64, dotted and triplet — plus reverb pre-delay and decay presets.",
  alternates: { canonical: "/delay-reverb-calculator" },
};

export default function Page() {
  return <TunebadApp initialView="delay" />;
}
