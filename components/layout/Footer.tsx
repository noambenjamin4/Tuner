"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export function Footer() {
  const { t } = useI18n();

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <picture>
            <source media="(prefers-color-scheme: dark)" srcSet="/logo-dark.png" />
            <img src="/logo-light.png" alt="" width={24} height={24} className="site-footer-logo" loading="lazy" />
          </picture>
          <span className="site-footer-wordmark">TUNEBAD</span>
        </div>
        <p className="site-footer-tagline">{t("footer.tagline")}</p>
        <p className="site-footer-copyright">{t("footer.copyright")}</p>
        <p className="site-footer-legal">
          <Link href="/copyright">{t("footer.copyrightLink")}</Link>
        </p>
      </div>
    </footer>
  );
}
