import type { Metadata } from "next";
import Link from "next/link";
import { I18nProvider } from "@/lib/i18n";
import { CopyrightBody } from "@/components/legal/CopyrightBody";

export const metadata: Metadata = {
  title: "Copyright Disclaimer",
  description:
    "The TuneBad Copyright Disclaimer: the terms that cover how you use TuneBad's analysis and conversion tools, and its policy on copyrighted material.",
  alternates: { canonical: "/copyright" },
};

export default function CopyrightPage() {
  return (
    <div className="app-shell">
      <header className="legal-topbar">
        <Link href="/" className="brand" aria-label="TuneBad, back to home">
          <span className="brand-logo-wrap">
            <picture>
              <source media="(prefers-color-scheme: dark)" srcSet="/logo-dark.png" />
              <img src="/logo-light.png" alt="" width={34} height={34} className="brand-logo" />
            </picture>
          </span>
          <span className="brand-wordmark">TUNEBAD</span>
        </Link>
      </header>

      <main>
        {/* Wrapped in its own I18nProvider (this page lives outside TunebadApp).
            SSR renders English; the provider picks up the visitor's saved
            locale after hydration, same pattern as the homepage FAQ. */}
        <I18nProvider>
          <CopyrightBody />
        </I18nProvider>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="site-footer-brand">
            <picture>
              <source media="(prefers-color-scheme: dark)" srcSet="/logo-dark.png" />
              <img src="/logo-light.png" alt="" width={24} height={24} className="site-footer-logo" loading="lazy" />
            </picture>
            <span className="site-footer-wordmark">TUNEBAD</span>
          </div>
          <p className="site-footer-copyright">© 2026 TuneBad</p>
        </div>
      </footer>
    </div>
  );
}
