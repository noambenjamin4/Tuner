import type { Metadata } from "next";
import { ToolPageShell } from "@/components/files/ToolPageShell";
import { RelatedTools } from "@/components/files/RelatedTools";
import { ToolFaq } from "@/components/files/ToolFaq";
import { AudioMasteringTool } from "@/components/files/AudioMasteringTool";

export const metadata: Metadata = {
  title: "Free Online Audio Mastering: Master a Song",
  description:
    "Master any song in your browser with EQ, glue compression, and a loudness limiter, or match a reference track's tone and loudness. Free, no upload, no sign-up.",
  alternates: { canonical: "/audio-mastering" },
  openGraph: { images: [{ url: "/og/audio-mastering.png", width: 1200, height: 630 }] },
};

export default function Page() {
  return (
    <ToolPageShell tool={{ name: "Audio Mastering", path: "/audio-mastering" }}>
      <AudioMasteringTool />
      <ToolFaq
        faqs={[
          { q: "audiomasteringtool.faq1Q", a: "audiomasteringtool.faq1A" },
          { q: "audiomasteringtool.faq2Q", a: "audiomasteringtool.faq2A" },
          { q: "audiomasteringtool.faq3Q", a: "audiomasteringtool.faq3A" },
        ]}
      />
      <RelatedTools tools={["bass-booster", "audio-converter", "audio-joiner"]} />
    </ToolPageShell>
  );
}
