import type { Metadata } from "next";
import { ToolPageShell } from "@/components/files/ToolPageShell";
import { RelatedTools } from "@/components/files/RelatedTools";
import { ToolFaq } from "@/components/files/ToolFaq";
import { EightDTool } from "@/components/files/EightDTool";

export const metadata: Metadata = {
  title: "8D Audio Maker: Convert Any Song to 8D Online",
  description:
    "Make an 8D audio edit that slowly pans left to right for headphones, right in your browser. Free, no upload, no sign-up.",
  alternates: { canonical: "/8d-audio" },
  openGraph: { images: [{ url: "/og/8d-audio.png", width: 1200, height: 630 }] },
};

export default function Page() {
  return (
    <ToolPageShell tool={{ name: "8D Audio Maker", path: "/8d-audio" }}>
      <EightDTool />
      <ToolFaq
        faqs={[
          { q: "eightdtool.faq1Q", a: "eightdtool.faq1A" },
          { q: "eightdtool.faq2Q", a: "eightdtool.faq2A" },
          { q: "eightdtool.faq3Q", a: "eightdtool.faq3A" },
        ]}
      />
      <RelatedTools tools={["nightcore-maker", "bass-booster", "audio-converter"]} />
    </ToolPageShell>
  );
}
