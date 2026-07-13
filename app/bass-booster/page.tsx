import type { Metadata } from "next";
import { ToolPageShell } from "@/components/files/ToolPageShell";
import { RelatedTools } from "@/components/files/RelatedTools";
import { ToolFaq } from "@/components/files/ToolFaq";
import { BassBoosterTool } from "@/components/files/BassBoosterTool";

export const metadata: Metadata = {
  title: "Bass Booster: Add Bass to a Song Online",
  description:
    "Boost the low end of any audio file in your browser with a low-shelf bass boost and a built-in safety limiter so the output never clips. Free, no upload, no sign-up.",
  alternates: { canonical: "/bass-booster" },
  openGraph: { images: [{ url: "/og/bass-booster.png", width: 1200, height: 630 }] },
};

export default function Page() {
  return (
    <ToolPageShell tool={{ name: "Bass Booster", path: "/bass-booster" }}>
      <BassBoosterTool />
      <ToolFaq
        faqs={[
          { q: "bassboostertool.faq1Q", a: "bassboostertool.faq1A" },
          { q: "bassboostertool.faq2Q", a: "bassboostertool.faq2A" },
          { q: "bassboostertool.faq3Q", a: "bassboostertool.faq3A" },
        ]}
      />
      <RelatedTools tools={["nightcore-maker", "8d-audio", "audio-converter"]} />
    </ToolPageShell>
  );
}
