import type { Metadata } from "next";
import { ToolPageShell } from "@/components/files/ToolPageShell";
import { RelatedTools } from "@/components/files/RelatedTools";
import { ImageTool } from "@/components/files/ImageTool";

export const metadata: Metadata = {
  title: "Compress Images to 100KB (or 50KB, 200KB, 500KB)",
  description:
    "Hit an exact file-size limit: compress any image to 100KB, 50KB, 200KB, or 500KB in your browser. Great for forms and uploads with size caps. Free.",
  alternates: { canonical: "/compress-image-to-100kb" },
  openGraph: { images: [{ url: "/og/compress-image-100kb.png", width: 1200, height: 630 }] },
};

export default function Page() {
  return (
    <ToolPageShell tool={{ name: "Compress to 100KB", path: "/compress-image-to-100kb" }}>
      <ImageTool
        mode="compress"
        titleKey="imgtool.title100kb"
        subtitleKey="imgtool.subtitle100kb"
        targetKbOptions={[50, 100, 200, 500]}
        defaultTargetKb={100}
      />
      <RelatedTools tools={["compress-image", "resize-image", "image-converter"]} />
    </ToolPageShell>
  );
}
