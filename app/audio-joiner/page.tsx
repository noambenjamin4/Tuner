import type { Metadata } from "next";
import { ToolPageShell } from "@/components/files/ToolPageShell";
import { RelatedTools } from "@/components/files/RelatedTools";
import { ToolFaq } from "@/components/files/ToolFaq";
import { AudioJoinerTool } from "@/components/files/AudioJoinerTool";

export const metadata: Metadata = {
  title: "Audio Joiner: Merge MP3 Files Online",
  description:
    "Combine two or more audio files into one, reorder them, and export as MP3 or WAV, right in your browser. Free, no upload, no sign-up.",
  alternates: { canonical: "/audio-joiner" },
  openGraph: { images: [{ url: "/og/audio-joiner.png", width: 1200, height: 630 }] },
};

export default function Page() {
  return (
    <ToolPageShell tool={{ name: "Audio Joiner", path: "/audio-joiner" }}>
      <AudioJoinerTool />
      <ToolFaq
        faqs={[
          { q: "joinertool.faq1Q", a: "joinertool.faq1A" },
          { q: "joinertool.faq2Q", a: "joinertool.faq2A" },
          { q: "joinertool.faq3Q", a: "joinertool.faq3A" },
        ]}
      />
      <RelatedTools tools={["audio-converter", "wav-to-mp3", "flac-to-mp3"]} />
    </ToolPageShell>
  );
}
