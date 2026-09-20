import type { NextConfig } from "next";

// The desktop build (apps/desktop, Electron) has no Next.js server to run
// headers()/rewrites() through, so it needs a static export instead. Its own
// tiny static server sets the COOP/COEP headers below (see
// apps/desktop/main.cjs). The normal web/PWA build keeps the Node server so
// headers() applies directly.
const isDesktopExport = process.env.CUEPOINT_TARGET === "desktop";

// SharedArrayBuffer requires the page to be cross-origin isolated.
// Without these headers the engine still runs, but falls back to the
// MessagePort transport (see packages/dsp/src/shared-state.ts).
const config: NextConfig = {
  ...(isDesktopExport ? { output: "export" as const } : {}),
  // The workspace packages are consumed as TypeScript source (workspace:*,
  // no build step of their own), so Next has to run them through its own
  // compiler rather than treating them as pre-built node_modules code.
  transpilePackages: ["@cuepoint/dsp", "@cuepoint/engine", "@cuepoint/analysis", "@cuepoint/library", "@cuepoint/sync"],
  webpack(webpackConfig) {
    // Our source uses ESM-style relative imports with an explicit ".js"
    // extension pointing at ".ts" files (required by "verbatimModuleSyntax"
    // + "moduleResolution: Bundler"). tsc and Vite/Vitest resolve that
    // automatically; webpack does not unless told to.
    webpackConfig.resolve.extensionAlias = {
      ...webpackConfig.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return webpackConfig;
  },
  ...(isDesktopExport
    ? {}
    : {
        async headers() {
          return [
            {
              source: "/:path*",
              headers: [
                { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
                { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
              ],
            },
          ];
        },
      }),
};

export default config;
