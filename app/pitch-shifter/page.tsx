import type { Metadata } from "next";
import { TunebadApp } from "@/components/TunebadApp";

export const metadata: Metadata = {
  title: "Pitch Shifter & Key Changer",
  description:
    "Change the pitch or musical key of any audio file without changing its tempo. Free online pitch shifter and song key changer that runs in your browser.",
  alternates: { canonical: "/pitch-shifter" },
};

export default function Page() {
  return <TunebadApp initialView="pitch" />;
}
