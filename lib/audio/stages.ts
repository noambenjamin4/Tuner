import type { DictKey } from "@/lib/i18n/locales/en";

// Named phases of the long client-side audio jobs (decode -> measure -> render
// -> normalize -> measure again). Tools report the phase they have ACTUALLY
// reached so the status text moves during multi-second waits instead of sitting
// on one frozen string. There is deliberately no percentage: none of these
// phases expose a real ratio, and a guessed bar would be a lie.
export type AudioStage =
  | "decoding"
  | "resampling"
  | "measuringInput"
  | "rendering"
  | "normalizing"
  | "measuringOutput";

export type StageReporter = (stage: AudioStage) => void;

export const STAGE_LABELS: Record<AudioStage, DictKey> = {
  decoding: "stage.decoding",
  resampling: "stage.resampling",
  measuringInput: "stage.measuringInput",
  rendering: "stage.rendering",
  normalizing: "stage.normalizing",
  measuringOutput: "stage.measuringOutput",
};

// Hands the main thread back to the browser long enough for React to commit and
// PAINT the stage label just reported. Needed only before a synchronous phase
// (the loudness meter, the limiter, the true-peak pass): those block the main
// thread for seconds, so without a yield the label they announce would not
// appear on screen until after the work it describes had already finished.
//
// rAF fires immediately before a paint and the nested setTimeout resolves just
// after it; the 50 ms fallback covers backgrounded tabs, where rAF never fires
// and the job would otherwise stall forever waiting for a frame.
export function nextPaint(): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setTimeout(finish, 0));
    }
    setTimeout(finish, 50);
  });
}
