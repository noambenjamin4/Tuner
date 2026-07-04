const isDev = process.env.NODE_ENV !== "production";

// Static-compatible CSP: the app's pages are prerendered at build time, so a
// per-request nonce (middleware) can never match the baked HTML — that setup
// blocks every script on Vercel. 'unsafe-inline' is required for Next's inline
// bootstrap on static pages; the app has no HTML-injection sinks (no
// dangerouslySetInnerHTML, React-escaped rendering throughout).
// wasm-unsafe-eval: essentia.js compiles WebAssembly; unsafe-eval dev-only (React Refresh).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
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
    ];
  },
};

export default nextConfig;
