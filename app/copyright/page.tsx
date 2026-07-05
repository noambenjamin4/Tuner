import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Copyright Disclaimer",
  description:
    "The TuneBad Copyright Disclaimer: the terms that cover how you use TuneBad's analysis and conversion tools, and its policy on copyrighted material.",
  alternates: { canonical: "/copyright" },
};

const LAST_UPDATED = "2026-07-04";

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
        <article className="legal">
          <h1 className="legal-title">Copyright Disclaimer</h1>
          <p className="legal-updated">Last updated: {LAST_UPDATED}</p>

          <p>
            Welcome to TuneBad (the &ldquo;Service&rdquo;). This Copyright Disclaimer governs your access to and use
            of TuneBad&rsquo;s web-based tools and services. By using the Service and submitting links or files for
            analysis or conversion, you acknowledge that you have read, understood, and agreed to be bound by the terms
            set out below.
          </p>

          <h2>1. Strict prohibition of copyright infringement</h2>
          <p>
            TuneBad is provided solely for analyzing and converting publicly available media for personal, educational,
            and non-commercial use. Downloading, converting, or distributing copyrighted material without the explicit
            permission of the copyright owner is strictly prohibited when using this Service.
          </p>
          <p>It is your sole responsibility to ensure that any content you analyze or convert is:</p>
          <ul>
            <li>owned by you;</li>
            <li>in the public domain;</li>
            <li>licensed under Creative Commons or a similar open license that permits such use; or</li>
            <li>otherwise expressly authorized for conversion and download by the copyright owner.</li>
          </ul>
          <p>Any attempt to use TuneBad to infringe intellectual-property rights is a direct violation of these terms.</p>

          <h2>2. How TuneBad works, and disclaimer of liability</h2>
          <p>
            TuneBad is a neutral technical tool. Audio analysis runs entirely in your own web browser. Link conversions
            are processed temporarily, either on the operator&rsquo;s own personal machine or through a short-lived
            process, and the resulting file is streamed directly to you. TuneBad does not host, store, catalog, index,
            or distribute media files or converted outputs, and any temporary files created during a conversion are
            deleted automatically.
          </p>
          <p>Accordingly:</p>
          <ul>
            <li>
              TuneBad disclaims all liability, responsibility, and warranties (express or implied) for the legality,
              accuracy, or appropriateness of any content that users process through the Service.
            </li>
            <li>
              Under no circumstances shall TuneBad or its operator be liable for any direct, indirect, incidental,
              special, or consequential damages arising from copyright infringement committed by you or any third party
              using the Service.
            </li>
            <li>
              You agree to indemnify and hold TuneBad and its operator harmless from any claims, damages, liabilities,
              costs, or expenses (including legal fees) arising from your misuse of the Service or your violation of
              third-party copyrights.
            </li>
          </ul>

          <h2>3. Your affirmations and responsibilities</h2>
          <p>
            By using the Service, you represent and warrant that you hold all rights and permissions necessary to
            analyze, convert, and download the selected media. You acknowledge that downloading media from unauthorized
            sources may violate copyright law and the terms of service of third-party platforms (including YouTube&rsquo;s
            Terms of Service). TuneBad does not monitor, pre-screen, or review the links or files you submit, and you
            assume all legal and financial risk associated with your use of the Service.
          </p>

          <h2>4. Abuse prevention and right to terminate</h2>
          <p>
            To protect rights holders and prevent misuse of the Service, TuneBad reserves the right, at its sole
            discretion and without prior notice, to:
          </p>
          <ul>
            <li>block specific links, channels, playlists, or keywords from being processed;</li>
            <li>refuse service to anyone who repeatedly attempts to process copyrighted content; and</li>
            <li>take technical measures to restrict access for users who violate these terms or applicable law.</li>
          </ul>

          <h2>5. Copyright claims and takedown requests</h2>
          <p>
            TuneBad respects the intellectual-property rights of creators. If you are a copyright owner (or an
            authorized agent) and believe the Service is being used to access your work without authorization, you may
            submit a takedown notice to the site operator. A valid notice should identify the specific work concerned,
            the material at issue, and include proof that you hold the relevant rights. TuneBad reviews and responds to
            valid notices promptly, and will remove or block access to the identified material where appropriate.
          </p>

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
