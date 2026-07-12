import type { Metadata } from "next";
import { ToolPageShell } from "@/components/files/ToolPageShell";
import { RelatedTools } from "@/components/files/RelatedTools";
import { ToolFaq } from "@/components/files/ToolFaq";
import { VideoTool } from "@/components/files/VideoTool";

export const metadata: Metadata = {
  title: "Compress Video Online (No Upload)",
  description:
    "Shrink a video to 10, 25, 50, or 100 MB right in your browser. The file never leaves your device. Free, no sign-up, no watermark.",
  alternates: { canonical: "/compress-video" },
  openGraph: { images: [{ url: "/og/compress-video.png", width: 1200, height: 630 }] },
};

export default function Page() {
  return (
    <ToolPageShell tool={{ name: "Compress Video", path: "/compress-video" }}>
      <VideoTool
        titleKey="vidtool.titleGeneric"
        subtitleKey="vidtool.subtitleGeneric"
        targetPresetsMB={[10, 25, 50, 100]}
        defaultTargetMB={25}
      />
      <ToolFaq
        faqs={[
          { q: "vidtool.faqGeneric1Q", a: "vidtool.faqGeneric1A" },
          { q: "vidtool.faqGeneric2Q", a: "vidtool.faqGeneric2A" },
          { q: "vidtool.faqGeneric3Q", a: "vidtool.faqGeneric3A" },
          { q: "vidtool.faqGeneric4Q", a: "vidtool.faqGeneric4A" },
        ]}
      />
      <RelatedTools tools={["compress-video-for-discord", "video-converter", "audio-converter"]} />
    </ToolPageShell>
  );
}
