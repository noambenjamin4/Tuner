import type { Metadata } from "next";
import { ToolPageShell } from "@/components/files/ToolPageShell";
import { RelatedTools } from "@/components/files/RelatedTools";
import { ImageTool } from "@/components/files/ImageTool";

export const metadata: Metadata = {
  title: "Compress Images Online",
  description:
    "Shrink JPG, PNG, and WebP file sizes with a quality slider, right in your browser. Files never leave your device. Free, no sign-up.",
  alternates: { canonical: "/compress-image" },
  openGraph: { images: [{ url: "/og/compress-image.png", width: 1200, height: 630 }] },
};

export default function Page() {
  return (
    <ToolPageShell tool={{ name: "Compress Image", path: "/compress-image" }}>
      <ImageTool mode="compress" titleKey="imgtool.titleCompress" subtitleKey="imgtool.subtitleCompress" />
      <RelatedTools tools={["compress-image-to-100kb", "resize-image", "image-converter"]} />
    </ToolPageShell>
  );
}
