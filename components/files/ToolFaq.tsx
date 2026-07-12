"use client";

// Visible FAQ + FAQPage JSON-LD for a standalone tool page. Same pattern as
// components/layout/LandingSeo.tsx: a client component so the visitor reads
// it in their language, but the SSR default locale is English so crawlers
// index the English copy, and the JSON-LD is built from the canonical
// English strings regardless of the visitor's locale.
import { useI18n } from "@/lib/i18n";
import en from "@/lib/i18n/locales/en";
import type { DictKey } from "@/lib/i18n/locales/en";

export type FaqEntry = { q: DictKey; a: DictKey };

export function ToolFaq({ faqs }: { faqs: FaqEntry[] }) {
  const { t } = useI18n();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: en[f.q],
      acceptedAnswer: { "@type": "Answer", text: en[f.a] },
    })),
  };
  return (
    <section className="tool-faq" aria-label="Frequently asked questions">
      <h2 className="tool-faq-heading">{t("landing.faqHeading")}</h2>
      <div className="seo-faq">
        {faqs.map((f) => (
          <details key={f.q} className="seo-faq-item">
            <summary>{t(f.q)}</summary>
            <p>{t(f.a)}</p>
          </details>
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </section>
  );
}
