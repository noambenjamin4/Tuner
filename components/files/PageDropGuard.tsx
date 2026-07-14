"use client";

import { useWindowFileDrop } from "@/hooks/useWindowFileDrop";

// Navigation guard for the standalone tool pages. Renders nothing: it only stops
// the browser from navigating to a file dropped outside a tool's drop zone (or
// after that zone is gone, which is every tool once a file is loaded), which
// would otherwise throw away the whole in-progress session.
//
// It never loads a file — a tool that wants a stray drop to REPLACE its current
// file calls useWindowFileDrop itself with `active` set (see AudioMasteringTool).
// Both can be mounted at once; the guard is idempotent.
export function PageDropGuard() {
  useWindowFileDrop();
  return null;
}
