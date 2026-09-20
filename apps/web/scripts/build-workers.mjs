// Same reasoning as build-worklets.mjs: a Worker's global scope needs a
// standalone bundle, since it can't resolve the analysis package's relative
// imports the way the app bundler does for main-thread code.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const analysisSrc = path.resolve(here, "../../../packages/analysis/src");
const outdir = path.resolve(here, "../public/workers");

await build({
  entryPoints: [path.join(analysisSrc, "worker.ts")],
  bundle: true,
  format: "esm",
  target: "es2022",
  outdir,
  logLevel: "info",
});
