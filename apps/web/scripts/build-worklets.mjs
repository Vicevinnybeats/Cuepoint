// AudioWorklet modules load as plain ES modules in a dedicated global scope;
// the browser will not resolve their relative imports into ../kernels/*.ts
// the way a bundler does for the rest of the app. This bundles the two
// worklet entry points from @cuepoint/dsp into standalone files the
// AudioContext can addModule() directly. Runs before dev/build.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const dspSrc = path.resolve(here, "../../../packages/dsp/src");
const outdir = path.resolve(here, "../public/worklets");

await build({
  entryPoints: [
    path.join(dspSrc, "worklets/deck-processor.ts"),
    path.join(dspSrc, "worklets/master-processor.ts"),
  ],
  bundle: true,
  format: "esm",
  target: "es2022",
  outdir,
  logLevel: "info",
});
