import Link from "next/link";
import type { ReactNode } from "react";

// Shared server-rendered shell for the English guide pages. Mirrors the
// copyright page's chrome (.legal* CSS) and injects Article structured data.
export function GuideShell({
  title,
  description,
  path,
  datePublished,
  children,
}: {
  title: string;
  description: string;
  path: string;
  datePublished: string;
  children: ReactNode;
}) {
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    datePublished,
    author: { "@type": "Organization", name: "TuneBad", url: "https://www.tunebad.com/" },
    publisher: { "@type": "Organization", name: "TuneBad", url: "https://www.tunebad.com/" },
    mainEntityOfPage: `https://www.tunebad.com${path}`,
  };

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
        <article className="legal guide">
          {children}
          <p className="legal-back">
            <Link href="/">← Back to TuneBad</Link>
          </p>
        </article>
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

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
    </div>
  );
}
