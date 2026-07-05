import type { Metadata } from "next";
import { TunebadApp } from "@/components/TunebadApp";

export const metadata: Metadata = {
  title: "Pitch Shifter & Key Changer",
  description:
    "Change the pitch or key of any audio file without touching the tempo. A free pitch shifter and key changer that runs in your browser.",
  alternates: { canonical: "/pitch-shifter" },
};

export default function Page() {
  return <TunebadApp initialView="pitch" />;
}
