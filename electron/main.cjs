// Overlays: janelas pequenas, sem moldura, transparentes e sempre por cima do jogo.
// Cada janela mostra um overlay (?overlay=delta | sectors | map | times). As janelas abertas seguem as
// Configurações (data/settings.json) e abrem/fecham na hora quando estas mudam.
// Precisa do "npm run dev" a correr. O jogo tem de estar em "janela sem bordas".
const { app, BrowserWindow, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const BASE_URL = process.env.OVERLAY_URL || "http://localhost:5173/";
const DATA = path.join(__dirname, "..", "data");
const SETTINGS_FILE = path.join(DATA, "settings.json");
const BOUNDS_FILE = path.join(DATA, "overlay-windows.json"); // posição e tamanho de cada janela

// Tipo de overlay -> interruptor nas Configurações e tamanho inicial.
const OVERLAYS = {
  delta: { setting: "overlayDeltaWindow", width: 300, height: 150 },
  sectors: { setting: "overlaySectorsWindow", width: 360, height: 120 },
  map: { setting: "overlayMapWindow", width: 320, height: 300 },
  times: { setting: "overlayTimesWindow", width: 280, height: 130 },
};

const windows = new Map();

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

let savedBounds = readJson(BOUNDS_FILE, {});
let saveTimer = null;
function rememberBounds(kind, win) {
  savedBounds[kind] = win.getBounds();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(BOUNDS_FILE, JSON.stringify(savedBounds, null, 2));
  }, 500);
}

function openOverlay(kind, index) {
  const cfg = OVERLAYS[kind];
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  const bounds = savedBounds[kind] ?? { width: cfg.width, height: cfg.height, x: width - cfg.width - 20, y: 40 + index * 170 };
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    hasShadow: false,
    title: `Forza Overlay • ${kind}`,
    webPreferences: { contextIsolation: true },
  });
  win.setAlwaysOnTop(true, "screen-saver"); // fica por cima mesmo de jogos em janela sem bordas
  win.setVisibleOnAllWorkspaces(true);
  win.on("moved", () => rememberBounds(kind, win));
  win.on("resized", () => rememberBounds(kind, win));
  win.on("closed", () => windows.delete(kind));

  const url = `${BASE_URL}?overlay=${kind}`;
  const load = () => {
    if (!win.isDestroyed()) win.loadURL(url).catch(() => setTimeout(load, 2000)); // espera pelo Vite
  };
  load();
  windows.set(kind, win);
}

// Abre/fecha janelas para corresponder às Configurações.
function syncWindows() {
  const settings = readJson(SETTINGS_FILE, {});
  Object.entries(OVERLAYS).forEach(([kind, cfg], index) => {
    const wanted = settings[cfg.setting] ?? true;
    const win = windows.get(kind);
    if (wanted && !win) openOverlay(kind, index);
    else if (!wanted && win) win.close();
  });
}

app.whenReady().then(() => {
  syncWindows();
  fs.watchFile(SETTINGS_FILE, { interval: 1000 }, syncWindows);
});
// Fechar todas as janelas à mão termina o programa; desligá-las nas Configurações também.
app.on("window-all-closed", () => app.quit());
