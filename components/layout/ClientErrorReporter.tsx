"use client";

import { useEffect } from "react";

// Reports uncaught client errors to /api/client-error so real-world failures
// (decode errors, worker crashes, wasm init failures) are visible. Sends at
// most MAX_PER_PAGE per pageview, skips cross-origin "Script error." noise
// (browser extensions, third-party scripts we can't act on), and uses
// keepalive so a report survives the tab closing right after the crash.
const MAX_PER_PAGE = 5;

// Production only. Without this, a dev server writes into the SAME Supabase
// table as real visitors — and every mid-edit HMR ReferenceError lands there
// looking exactly like a live crash. The first errors this reporter ever
// collected were 12 of those, from localhost, and they'd have buried a real
// user's report. Dev errors belong in the console, where you're already looking.
function isReportable(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  // A production BUILD can still run locally (next start) — only report from
  // the real origin.
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]";
}

function report(source: "onerror" | "unhandledrejection", message: string, stack?: string) {
  try {
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        source,
        message: message.slice(0, 500),
        url: window.location.pathname.slice(0, 300),
        stack: stack ? stack.slice(0, 4000) : undefined,
      }),
    });
  } catch {
    // Reporting must never cause its own error loop.
  }
}

export function ClientErrorReporter() {
  useEffect(() => {
    if (!isReportable()) return;
    let sent = 0;
    const onError = (event: ErrorEvent) => {
      if (sent >= MAX_PER_PAGE) return;
      const message = event.message || "";
      // Opaque cross-origin errors carry no signal we can act on.
      if (!message || message === "Script error.") return;
      sent += 1;
      report("onerror", message, event.error instanceof Error ? event.error.stack : undefined);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (sent >= MAX_PER_PAGE) return;
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason ?? "");
      if (!message) return;
      sent += 1;
      report("unhandledrejection", message, reason instanceof Error ? reason.stack : undefined);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
