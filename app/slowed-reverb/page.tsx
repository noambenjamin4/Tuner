import type { Metadata } from "next";
import { TunebadApp } from "@/components/TunebadApp";

export const metadata: Metadata = {
  title: "Slowed + Reverb Maker",
  description:
    "Make a slowed and reverb (or sped up / nightcore) version of any song online. Adjust speed, pitch, and reverb, then export the result — free, in your browser.",
  alternates: { canonical: "/slowed-reverb" },
};

export default function Page() {
  return <TunebadApp initialView="remix" />;
}
