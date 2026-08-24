import type { NextConfig } from "next";

/**
 * Every header below was added because Axiom found it missing on Axiom.
 * Running the tool on itself is the cheapest possible test of whether the
 * findings are real and whether the fixes we recommend actually work.
 */
const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    // Next injects inline bootstrap scripts and Tailwind emits inline styles,
    // so those two sources are unavoidable without a nonce pipeline. Everything
    // else is locked to same-origin, and framing is denied outright.
    value: [
      "default-src 'self'",
      // React's development build uses eval() for debugging features such as
      // reconstructing callstacks. It never does so in production, so the
      // allowance is scoped to dev rather than weakening the shipped policy.
      `script-src 'self' 'unsafe-inline'${
        process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
      }`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      `connect-src 'self'${
        process.env.NODE_ENV === "development" ? " ws: wss:" : ""
      }`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  /**
   * Both packages must stay out of the server bundle.
   *
   * playwright-core resolves browser binaries and spawns them from real paths on
   * disk; bundling it breaks launch. axe-core ships a 1.3MB pre-built source
   * string that we inject into the audited page — the bundler mangles it into
   * something the browser will not execute, which surfaces as `window.axe`
   * being undefined at injection time.
   */
  serverExternalPackages: ["playwright-core", "axe-core"],

  /** Emits a self-contained server bundle for the Docker runtime stage. */
  output: "standalone",

  /**
   * Next traces JS imports, but playwright-core also reads non-JS assets at
   * runtime (browsers.json, which maps browser versions to download paths).
   * Without this the standalone server builds fine and then fails on first
   * launch with "Cannot find module browsers.json" — force the whole package in.
   */
  outputFileTracingIncludes: {
    "/api/scan": ["./node_modules/playwright-core/**/*"],
  },

  /** Don't advertise the framework and version to anyone scanning for CVEs. */
  poweredByHeader: false,

  /** The dev overlay badge sits over the UI during demo recording. */
  devIndicators: false,

  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
