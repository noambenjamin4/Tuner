"use client";

// Homepage-only About/FAQ section. A client component so it renders in the
// visitor's language via i18n, while still landing in the server HTML in
// English (the I18nProvider's SSR default locale is "en"), which is what
// crawlers index. The FAQPage JSON-LD stays canonical English regardless of
// the visitor's locale.
import { useI18n } from "@/lib/i18n";
import en from "@/lib/i18n/locales/en";
import type { DictKey } from "@/lib/i18n/locales/en";

const VALUE_KEYS: { title: DictKey; body: DictKey }[] = [
  { title: "landing.value1Title", body: "landing.value1Body" },
  { title: "landing.value2Title", body: "landing.value2Body" },
  { title: "landing.value3Title", body: "landing.value3Body" },
  { title: "landing.value4Title", body: "landing.value4Body" },
];

const FAQ_KEYS: { q: DictKey; a: DictKey }[] = [
  { q: "landing.faq1Q", a: "landing.faq1A" },
  { q: "landing.faq2Q", a: "landing.faq2A" },
  { q: "landing.faq3Q", a: "landing.faq3A" },
  { q: "landing.faq4Q", a: "landing.faq4A" },
  { q: "landing.faq5Q", a: "landing.faq5A" },
  { q: "landing.faq6Q", a: "landing.faq6A" },
];

// Canonical English schema, independent of the visitor's UI language.
const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_KEYS.map((k) => ({
    "@type": "Question",
    name: en[k.q],
    acceptedAnswer: { "@type": "Answer", text: en[k.a] },
  })),
};

export function LandingSeo() {
  const { t } = useI18n();
  return (
    <section className="seo-landing" aria-label="About TuneBad">
      <div className="seo-inner">
        <h2 className="seo-heading">{t("landing.heading")}</h2>
        <p className="seo-lede">{t("landing.lede")}</p>

        <ul className="seo-values">
          {VALUE_KEYS.map((v) => (
            <li key={v.title} className="seo-value">
              <h3>{t(v.title)}</h3>
              <p>{t(v.body)}</p>
            </li>
          ))}
        </ul>

        <h2 className="seo-heading seo-heading-faq">{t("landing.faqHeading")}</h2>
        <div className="seo-faq">
          {FAQ_KEYS.map((f) => (
            <details key={f.q} className="seo-faq-item">
              <summary>{t(f.q)}</summary>
              <p>{t(f.a)}</p>
            </details>
          ))}
        </div>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />
    </section>
  );
}
