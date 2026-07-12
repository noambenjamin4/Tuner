import type { Metadata } from "next";
import { ToolPageShell } from "@/components/files/ToolPageShell";
import { RelatedTools } from "@/components/files/RelatedTools";
import { ToolFaq } from "@/components/files/ToolFaq";
import { MediaConvertTool } from "@/components/files/MediaConvertTool";

export const metadata: Metadata = {
  title: "Audio Converter: MP3, WAV, FLAC, OGG & M4A",
  description:
    "Convert FLAC to MP3, M4A to MP3, WAV, OGG, and more right in your browser. Pick the MP3 bitrate. Files never leave your device. Free, no sign-up, no ads.",
  alternates: { canonical: "/audio-converter" },
  openGraph: { images: [{ url: "/og/audio-converter.png", width: 1200, height: 630 }] },
};

export default function Page() {
  return (
    <ToolPageShell tool={{ name: "Audio Converter", path: "/audio-converter" }}>
      <MediaConvertTool
        mode="audio"
        titleKey="mediatool.titleAudio"
        subtitleKey="mediatool.subtitleAudio"
      />
      <ToolFaq
        faqs={[
          { q: "mediatool.faqAudio1Q", a: "mediatool.faqAudio1A" },
          { q: "mediatool.faqAudio2Q", a: "mediatool.faqAudio2A" },
          { q: "mediatool.faqAudio3Q", a: "mediatool.faqAudio3A" },
          { q: "mediatool.faqAudio4Q", a: "mediatool.faqAudio4A" },
        ]}
      />
      <RelatedTools tools={["video-converter", "compress-video", "compress-video-for-discord"]} />
    </ToolPageShell>
  );
}
