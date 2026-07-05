import type { Metadata } from "next";
import { TunebadApp } from "@/components/TunebadApp";

// Per-device localStorage history — nothing for crawlers to index, so noindex.
export const metadata: Metadata = {
  title: "Analysis History",
  robots: { index: false, follow: true },
  alternates: { canonical: "/history" },
};

export default function Page() {
  return <TunebadApp initialView="history" />;
}
