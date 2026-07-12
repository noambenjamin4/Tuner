import type { Metadata } from "next";
import { ToolPageShell } from "@/components/files/ToolPageShell";
import { RelatedTools } from "@/components/files/RelatedTools";
import { ImageTool } from "@/components/files/ImageTool";

export const metadata: Metadata = {
  title: "Resize Images Online",
  description:
    "Resize any image to exact pixel dimensions in your browser, with optional aspect-ratio lock. Files never leave your device. Free, no sign-up.",
  alternates: { canonical: "/resize-image" },
  openGraph: { images: [{ url: "/og/resize-image.png", width: 1200, height: 630 }] },
};

export default function Page() {
  return (
    <ToolPageShell tool={{ name: "Resize Image", path: "/resize-image" }}>
      <ImageTool mode="resize" titleKey="imgtool.titleResize" subtitleKey="imgtool.subtitleResize" />
      <RelatedTools tools={["resize-image-for-instagram", "compress-image", "image-converter"]} />
    </ToolPageShell>
  );
}
