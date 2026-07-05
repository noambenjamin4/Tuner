"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AnalysisResult, HistoryEntry } from "@/types/analysis";
import { clampBpm } from "@/lib/format";
import { useHistory } from "@/hooks/useHistory";
import { I18nProvider } from "@/lib/i18n";
import { TopBar } from "./layout/TopBar";
import { Footer } from "./layout/Footer";
import { AnalyzerPanel } from "./analysis/AnalyzerPanel";
import { BpmToolsView } from "./bpm/BpmToolsView";
import { DelayCalculator } from "./delay/DelayCalculator";
import { PitchConverter } from "./pitch/PitchConverter";
import { ConverterView } from "./converter/ConverterView";
import { HistoryPanel } from "./history/HistoryPanel";
import { LoudnessPanel } from "./loudness/LoudnessPanel";
import { RemixStudio } from "./remix/RemixStudio";

export type ViewName = "analysis" | "bpm" | "delay" | "pitch" | "converter" | "loudness" | "remix" | "history";

const VIEW_NAMES: ViewName[] = ["analysis", "bpm", "delay", "pitch", "converter", "loudness", "remix", "history"];

// Each tool has a real, clean URL (no #hash). Switching tabs updates the address
// bar to these paths via the History API — no page reload, so app state is kept —
// and each path is a real server route (see app/<path>/page.tsx) on refresh/share.
const VIEW_TO_PATH: Record<ViewName, string> = {
  analysis: "/key-bpm-finder",
  bpm: "/bpm-tap",
  delay: "/delay-reverb-calculator",
  pitch: "/pitch-shifter",
  converter: "/converter",
  loudness: "/loudness",
  remix: "/slowed-reverb",
  history: "/history",
};

function viewForPath(pathname: string): ViewName | null {
  const match = (Object.keys(VIEW_TO_PATH) as ViewName[]).find((v) => VIEW_TO_PATH[v] === pathname);
  return match ?? null;
}

interface TunebadContextValue {
  view: ViewName;
  showView(view: ViewName): void;
  delayBpm: string;
  setDelayBpmInput(value: string): void;
  setMainBpm(value: number): number;
  metronomeBpm: number;
  setMetronomeBpm(value: number): void;
  lastAnalyzedBpm: number | null;
  setLastAnalyzedBpm(value: number | null): void;
  lastAnalysis: AnalysisResult | null;
  setLastAnalysis(result: AnalysisResult | null): void;
  history: HistoryEntry[];
  rememberResult(result: AnalysisResult): void;
  clearHistory(): void;
  pendingFiles: File[] | null;
  requestAnalysis(files: File[], options?: { switchView?: boolean }): void;
  clearPendingFiles(): void;
}

const TunebadContext = createContext<TunebadContextValue | null>(null);

export function useTunebad(): TunebadContextValue {
  const value = useContext(TunebadContext);
  if (!value) throw new Error("useTunebad must be used inside <TunebadApp>");
  return value;
}

export function TunebadApp({ initialView = "analysis" }: { initialView?: ViewName } = {}) {
  const [view, setView] = useState<ViewName>(initialView);
  // Gates the first-load cascade (header + active panel's children fading up
  // in a stagger). True only for the very first paint; flipped off shortly
  // after so revisiting a tab later doesn't replay the mount-in stagger —
  // CSS animations would otherwise re-run every time `display` flips from
  // `none` back to `block` on a `.page-view`.
  const [initialReveal, setInitialReveal] = useState(true);
  const [delayBpm, setDelayBpm] = useState("124.00");
  const [metronomeBpm, setMetronomeBpmState] = useState(124);
  const [lastAnalyzedBpm, setLastAnalyzedBpm] = useState<number | null>(null);
  const [lastAnalysis, setLastAnalysis] = useState<AnalysisResult | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const { items: history, rememberResult, clearHistory } = useHistory();

  useEffect(() => {
    // Sync the view from the real path first (e.g. /converter), then fall back to
    // legacy #hash links so old bookmarks still work.
    const byPath = viewForPath(window.location.pathname);
    if (byPath) {
      setView(byPath);
      return;
    }
    const initial = window.location.hash.replace("#", "");
    if (VIEW_NAMES.includes(initial as ViewName)) setView(initial as ViewName);
  }, []);

  useEffect(() => {
    // Well past the longest cascade delay + animation duration, so the
    // stagger always finishes before this flips off.
    const timer = window.setTimeout(() => setInitialReveal(false), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  const showView = useCallback((next: ViewName) => {
    setView(next);
    window.history.replaceState(null, "", VIEW_TO_PATH[next]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const setDelayBpmInput = useCallback((value: string) => {
    setDelayBpm(value);
    setMetronomeBpmState(Math.round(clampBpm(value)));
  }, []);

  const setMainBpm = useCallback((value: number) => {
    const bpm = clampBpm(value);
    setDelayBpm(bpm.toFixed(2));
    setMetronomeBpmState(Math.round(bpm));
    return bpm;
  }, []);

  const setMetronomeBpm = useCallback((value: number) => {
    setMetronomeBpmState(Math.round(clampBpm(value)));
  }, []);

  const requestAnalysis = useCallback(
    (files: File[], options?: { switchView?: boolean }) => {
      setPendingFiles(files);
      if (options?.switchView !== false) showView("analysis");
    },
    [showView],
  );

  const clearPendingFiles = useCallback(() => setPendingFiles(null), []);

  const contextValue = useMemo<TunebadContextValue>(
    () => ({
      view,
      showView,
      delayBpm,
      setDelayBpmInput,
      setMainBpm,
      metronomeBpm,
      setMetronomeBpm,
      lastAnalyzedBpm,
      setLastAnalyzedBpm,
      lastAnalysis,
      setLastAnalysis,
      history,
      rememberResult,
      clearHistory,
      pendingFiles,
      requestAnalysis,
      clearPendingFiles,
    }),
    [
      view,
      showView,
      delayBpm,
      setDelayBpmInput,
      setMainBpm,
      metronomeBpm,
      setMetronomeBpm,
      lastAnalyzedBpm,
      lastAnalysis,
      history,
      rememberResult,
      clearHistory,
      pendingFiles,
      requestAnalysis,
      clearPendingFiles,
    ],
  );

  return (
    <TunebadContext.Provider value={contextValue}>
      <I18nProvider>
        <div className={`app-shell${initialReveal ? " initial-reveal" : ""}`}>
          <div className="grain-overlay" aria-hidden="true" />
          <TopBar />
          <main>
            <section
              className={`page-view${view === "analysis" ? " active" : ""}`}
              data-view="analysis"
              data-active={view === "analysis"}
            >
              <AnalyzerPanel />
            </section>
            <section
              className={`page-view${view === "bpm" ? " active" : ""}`}
              data-view="bpm"
              data-active={view === "bpm"}
            >
              <BpmToolsView />
            </section>
            <section
              className={`page-view${view === "delay" ? " active" : ""}`}
              data-view="delay"
              data-active={view === "delay"}
            >
              <DelayCalculator />
            </section>
            <section
              className={`page-view${view === "pitch" ? " active" : ""}`}
              data-view="pitch"
              data-active={view === "pitch"}
            >
              <PitchConverter />
            </section>
            <section
              className={`page-view${view === "converter" ? " active" : ""}`}
              data-view="converter"
              data-active={view === "converter"}
            >
              <ConverterView />
            </section>
            <section
              className={`page-view${view === "loudness" ? " active" : ""}`}
              data-view="loudness"
              data-active={view === "loudness"}
            >
              <LoudnessPanel />
            </section>
            <section
              className={`page-view${view === "remix" ? " active" : ""}`}
              data-view="remix"
              data-active={view === "remix"}
            >
              <RemixStudio />
            </section>
            <section
              className={`page-view${view === "history" ? " active" : ""}`}
              data-view="history"
              data-active={view === "history"}
            >
              <HistoryPanel />
            </section>
          </main>
          <Footer />
        </div>
      </I18nProvider>
    </TunebadContext.Provider>
  );
}
