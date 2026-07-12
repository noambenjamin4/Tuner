import type { Metadata } from "next";
import { ToolPageShell } from "@/components/files/ToolPageShell";
import { RelatedTools } from "@/components/files/RelatedTools";
import { ImageTool } from "@/components/files/ImageTool";

export const metadata: Metadata = {
  title: "Resize Images for Instagram: Story, Post & Reel Sizes",
  description:
    "Resize any photo to Instagram's exact sizes: Story 1080x1920, square post 1080x1080, portrait 1080x1350, landscape 1080x566. Runs in your browser, free.",
  alternates: { canonical: "/resize-image-for-instagram" },
  openGraph: { images: [{ url: "/og/resize-image-instagram.png", width: 1200, height: 630 }] },
};

export default function Page() {
  return (
    <ToolPageShell tool={{ name: "Resize for Instagram", path: "/resize-image-for-instagram" }}>
      <ImageTool
        mode="resize"
        titleKey="imgtool.titleInstagram"
        subtitleKey="imgtool.subtitleInstagram"
        sizePresets={[
          { labelKey: "imgtool.presetStory", width: 1080, height: 1920 },
          { labelKey: "imgtool.presetPost", width: 1080, height: 1080 },
          { labelKey: "imgtool.presetPortrait", width: 1080, height: 1350 },
          { labelKey: "imgtool.presetLandscape", width: 1080, height: 566 },
        ]}
      />
      <RelatedTools tools={["resize-image", "compress-image-to-100kb", "image-converter"]} />
    </ToolPageShell>
  );
}
