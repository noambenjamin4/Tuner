import type { Metadata } from "next";
import { ToolPageShell } from "@/components/files/ToolPageShell";
import { RelatedTools } from "@/components/files/RelatedTools";
import { HeicTool } from "@/components/files/HeicTool";

export const metadata: Metadata = {
  title: "HEIC to JPG Converter: Convert iPhone Photos Online",
  description:
    "Convert HEIC or HEIF photos from an iPhone to JPG (or PNG) in your browser. No upload, no account, and it works on any device — including ones that can't open HEIC.",
  alternates: { canonical: "/heic-to-jpg" },
  openGraph: { images: [{ url: "/og/heic-to-jpg.png", width: 1200, height: 630 }] },
};

export default function Page() {
  return (
    <ToolPageShell tool={{ name: "HEIC to JPG", path: "/heic-to-jpg" }}>
      <HeicTool />
      <RelatedTools tools={["image-converter", "compress-image", "resize-image"]} />
    </ToolPageShell>
  );
}
