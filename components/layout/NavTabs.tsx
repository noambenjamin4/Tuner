"use client";

import { usePathname } from "next/navigation";
import { useTunebad, VIEW_TO_PATH, type ViewName } from "../TunebadApp";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n/locales/en";

const TABS: { page: ViewName; labelKey: DictKey }[] = [
  { page: "converter", labelKey: "nav.converter" },
  { page: "analysis", labelKey: "nav.analysis" },
  { page: "delay", labelKey: "nav.delay" },
  { page: "bpm", labelKey: "nav.bpm" },
  { page: "pitch", labelKey: "nav.pitch" },
  { page: "loudness", labelKey: "nav.loudness" },
  { page: "remix", labelKey: "nav.remix" },
  { page: "cutter", labelKey: "nav.cutter" },
  { page: "history", labelKey: "nav.history" },
];

export function NavTabs({ onNavigate }: { onNavigate?: () => void }) {
  const { view, showView } = useTunebad();
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <>
      {TABS.map((tab) => (
        <a
          key={tab.page}
          className={`ghost-button${view === tab.page ? " active" : ""}`}
          href={VIEW_TO_PATH[tab.page]}
          aria-current={view === tab.page ? "page" : undefined}
          onClick={(event) => {
            // Real hrefs keep these links crawlable and let cmd/ctrl-click open
            // a tab; a plain left-click stays in the SPA (no reload).
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault();
            showView(tab.page);
            onNavigate?.();
          }}
        >
          {t(tab.labelKey)}
        </a>
      ))}
      {/* Real navigation out of the SPA: mastering + the file-tools hub live
          on standalone pages, so no showView intercept here. */}
      <a
        className={`ghost-button${pathname === "/audio-mastering" ? " active" : ""}`}
        href="/audio-mastering"
        aria-current={pathname === "/audio-mastering" ? "page" : undefined}
        onClick={() => onNavigate?.()}
      >
        {t("nav.mastering")}
      </a>
      <a className="ghost-button" href="/tools" onClick={() => onNavigate?.()}>
        {t("nav.moreTools")}
      </a>
    </>
  );
}
