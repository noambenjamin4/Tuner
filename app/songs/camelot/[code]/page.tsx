import type { Metadata } from "next";
import { ALL_CODES, CamelotHubPage, camelotHubMeta } from "@/components/songs/CamelotHubPage";

// Camelot browse pages: /songs/camelot/8a etc. One per canonical Camelot code
// (24 total) — the "camelot 8a songs" search intent. Page 2+ lives at
// /songs/camelot/<code>/page/<n> and shares the renderer.
export const revalidate = 3600;

export function generateStaticParams() {
  return ALL_CODES.map((c) => ({ code: c.toLowerCase() }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const meta = camelotHubMeta(code, 1);
  if (!meta) return { title: "Not found | TuneBad", robots: { index: false, follow: true } };
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: meta.canonical },
  };
}

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <CamelotHubPage code={code} page={1} />;
}
