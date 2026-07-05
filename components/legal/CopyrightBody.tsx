"use client";

// Localized body of the /copyright page. Like LandingSeo, this is a client
// component whose SSR output is English (the I18nProvider default), so
// crawlers index English legal text while visitors read it in the language
// they picked in the app (shared tunebad-locale storage key).
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n/locales/en";

const LAST_UPDATED = "2026-07-04";

const SECTIONS: { h: DictKey; blocks: { type: "p" | "ul"; keys: DictKey[] }[] }[] = [
  {
    h: "copyright.s1H",
    blocks: [
      { type: "p", keys: ["copyright.s1P1"] },
      { type: "p", keys: ["copyright.s1P2"] },
      { type: "ul", keys: ["copyright.s1L1", "copyright.s1L2", "copyright.s1L3", "copyright.s1L4"] },
      { type: "p", keys: ["copyright.s1P3"] },
    ],
  },
  {
    h: "copyright.s2H",
    blocks: [
      { type: "p", keys: ["copyright.s2P1"] },
      { type: "p", keys: ["copyright.s2P2"] },
      { type: "ul", keys: ["copyright.s2L1", "copyright.s2L2", "copyright.s2L3"] },
    ],
  },
  {
    h: "copyright.s3H",
    blocks: [{ type: "p", keys: ["copyright.s3P1"] }],
  },
  {
    h: "copyright.s4H",
    blocks: [
      { type: "p", keys: ["copyright.s4P1"] },
      { type: "ul", keys: ["copyright.s4L1", "copyright.s4L2", "copyright.s4L3"] },
    ],
  },
  {
    h: "copyright.s5H",
    blocks: [{ type: "p", keys: ["copyright.s5P1"] }],
  },
];

export function CopyrightBody() {
  const { t } = useI18n();
  return (
    <article className="legal">
      <h1 className="legal-title">{t("copyright.title")}</h1>
      <p className="legal-updated">
        {t("copyright.updated")} {LAST_UPDATED}
      </p>

      <p>{t("copyright.intro")}</p>

      {SECTIONS.map((s) => (
        <section key={s.h}>
          <h2>{t(s.h)}</h2>
          {s.blocks.map((b, i) =>
            b.type === "p" ? (
              b.keys.map((k) => <p key={k}>{t(k)}</p>)
            ) : (
              <ul key={`${s.h}-ul-${i}`}>
                {b.keys.map((k) => (
                  <li key={k}>{t(k)}</li>
                ))}
              </ul>
            ),
          )}
        </section>
      ))}

      <p className="legal-back">
        <Link href="/">← {t("copyright.back")}</Link>
      </p>
    </article>
  );
}
