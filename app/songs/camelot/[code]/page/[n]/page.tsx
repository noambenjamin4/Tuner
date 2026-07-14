import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CamelotHubPage, camelotHubMeta } from "@/components/songs/CamelotHubPage";

// /songs/camelot/<code>/page/<n> — pages 2+ of a Camelot hub. Exists for crawl
// reach: see components/songs/HubPagination.tsx.
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string; n: string }>;
}): Promise<Metadata> {
  const { code, n } = await params;
  const page = Number(n);
  const meta = Number.isInteger(page) && page > 1 ? camelotHubMeta(code, page) : null;
  if (!meta) return { title: "Not found | TuneBad", robots: { index: false, follow: true } };
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: meta.canonical },
  };
}

export default async function Page({ params }: { params: Promise<{ code: string; n: string }> }) {
  const { code, n } = await params;
  const page = Number(n);
  // Page 1 has its own canonical URL; reject junk like /page/0 or /page/abc.
  if (!Number.isInteger(page) || page < 2) notFound();
  return <CamelotHubPage code={code} page={page} />;
}
