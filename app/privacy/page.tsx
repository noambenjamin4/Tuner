import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "TuneBad's privacy policy: what the website and the Chrome extension do and don't collect. Short version: no accounts, no tracking profiles, audio stays on your device.",
  alternates: { canonical: "/privacy" },
};

const LAST_UPDATED = "2026-07-20";

// English-only for now (unlike /copyright): this page is the compliance
// reference the Chrome Web Store links to, and its audience reads English.
// If it ever gets the CopyrightBody i18n treatment, keep the English text
// authoritative.
export default function PrivacyPage() {
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
        <article className="legal">
          <h1 className="legal-title">Privacy Policy</h1>
          <p className="legal-updated">Last updated: {LAST_UPDATED}</p>

          <p>
            TuneBad is a set of free audio tools: this website (tunebad.com) and a Chrome
            extension. The short version: there are no accounts, we do not build profiles of
            you, we do not sell or share data, and the audio you work with stays on your
            device unless a tool explicitly needs our server to fetch it for you.
          </p>

          <section>
            <h2>The website</h2>
            <p>
              Almost every tool on tunebad.com (the key &amp; BPM analyzer, cutter, loudness
              meter, slowed + reverb studio, and the file converters) runs entirely in your
              browser. Files you open with those tools are processed on your device and are
              never uploaded to us.
            </p>
            <p>
              The link converter is the exception: when you submit a media link, our server
              fetches and converts that media so it can hand you the file. Converted files are
              generated on demand and are not kept longer than needed to deliver your
              download. The link itself, and non-personal analysis results for it (such as
              tempo and key), may be cached in our song catalog so later visitors get an
              instant answer. Nothing in that catalog is tied to you.
            </p>
            <p>
              Your tool history and language preference are stored in your own browser
              (localStorage), not on our servers. Clearing your browser data removes them.
            </p>
            <p>
              We use Vercel Analytics for aggregate, cookie-free page statistics (which pages
              are visited, roughly where from). It does not use advertising identifiers and we
              cannot identify individual visitors from it. We show no ads and use no ad
              trackers.
            </p>
          </section>

          <section>
            <h2>The Chrome extension</h2>
            <p>
              The TuneBad extension collects nothing and transmits nothing. It has no
              accounts, no analytics, and no trackers, and it makes no network requests with
              your data. Recordings you make and settings you change are stored only in your
              browser&apos;s local extension storage, on your device. Uninstalling the
              extension removes them.
            </p>
            <p>Why it asks for each permission:</p>
            <ul>
              <li>
                Tab capture: records the audio of the current tab, only when you press Record
                or use the recording shortcut.
              </li>
              <li>
                Offscreen: keeps a recording you started running after the popup closes.
              </li>
              <li>Storage: saves your recordings and settings on this device only.</li>
              <li>
                Active tab: reads the current tab&apos;s title to name a recording, and lets
                the shortcut act on the tab you are viewing, only when you invoke it.
              </li>
              <li>Side panel: lets you dock the toolkit beside the page.</li>
            </ul>
            <p>
              The extension declares no host permissions and injects no scripts into
              websites, so it cannot read the pages you visit.
            </p>
          </section>

          <section>
            <h2>What we never do</h2>
            <ul>
              <li>No selling, renting, or sharing of user data with third parties.</li>
              <li>No advertising profiles and no cross-site tracking.</li>
              <li>No collection of the audio you record, edit, or convert on-device.</li>
            </ul>
          </section>

          <section>
            <h2>Changes</h2>
            <p>
              If our practices change, this page changes first, with the date above updated.
              Meaningful changes will be visible here before they take effect.
            </p>
          </section>

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
    </div>
  );
}
