// Electron main process. Loads the same static build apps/web produces
// (via `pnpm build:desktop`), served over a local HTTP server rather than
// file:// — Electron's file:// protocol can't carry the
// Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy headers
// SharedArrayBuffer needs, so this bundles the tiny server that sets them
// instead of running Next's own Node server inside Electron.
const { app, BrowserWindow } = require("electron");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

const STATIC_ROOT = path.join(__dirname, "..", "web", "out");
const PORT = 47821;

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json",
};

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let filePath = path.join(STATIC_ROOT, urlPath);

    if (!filePath.startsWith(STATIC_ROOT)) {
      res.writeHead(403).end();
      return;
    }
    if (urlPath.endsWith("/") || !fs.existsSync(filePath)) {
      filePath = path.join(STATIC_ROOT, urlPath.endsWith("/") ? `${urlPath}index.html` : `${urlPath}.html`);
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(STATIC_ROOT, "index.html");
    }

    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    res.setHeader("Content-Type", MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream");
    fs.createReadStream(filePath)
      .on("error", () => res.writeHead(404).end())
      .pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

async function createWindow() {
  await startServer();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#0a0a0b",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  win.loadURL(`http://127.0.0.1:${PORT}/`);
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
