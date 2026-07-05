import bundleAnalyzer from "@next/bundle-analyzer";

const isDev = process.env.NODE_ENV !== "production";

// Static-compatible CSP: the app's pages are prerendered at build time, so a
// per-request nonce (middleware) can never match the baked HTML — that setup
// blocks every script on Vercel. 'unsafe-inline' is required for Next's inline
// bootstrap on static pages; the app has no HTML-injection sinks (no
// dangerouslySetInnerHTML, React-escaped rendering throughout).
// 'unsafe-eval' is REQUIRED in production: essentia.js's emscripten WASM glue
// (the analyzer's BPM/key engine, run in a Web Worker) calls `new Function(...)`,
// which 'wasm-unsafe-eval' does NOT permit. Without it the worker throws an
// EvalError, silently falls back to the far weaker homemade DSP, and BPM/key go
// wrong. Verified via a minimal in-worker repro. The relaxation is acceptable
// here: the app already needs 'unsafe-inline' and has no HTML-injection sinks
// (no dangerouslySetInnerHTML; React-escaped rendering throughout).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: import.meta.dirname,
  serverExternalPackages: ["ffmpeg-static"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // essentia.js's emscripten build probes Node builtins it never uses in the browser
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    }
    return config;
  },
  async headers() {
    // Stable public assets: cache forever, rename on change. Repeat visitors
    // and tab switches load zero bytes for these.
    const immutable = { key: "Cache-Control", value: "public, max-age=31536000, immutable" };
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      { source: "/logo-:variant.png", headers: [immutable] },
      { source: "/icon-:size.png", headers: [immutable] },
      { source: "/icon.svg", headers: [immutable] },
      { source: "/apple-touch-icon.png", headers: [immutable] },
      { source: "/lame.min.js", headers: [immutable] },
      { source: "/og/:name", headers: [immutable] },
    ];
  },
};

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

export default withBundleAnalyzer(nextConfig);
