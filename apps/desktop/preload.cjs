// No privileged Electron APIs are exposed to the renderer. The app only
// needs standard web platform features (Web Audio, IndexedDB, File API),
// all available without a preload bridge; contextIsolation stays on.
