// Overlay: janela pequena, sem moldura, transparente e sempre por cima do jogo.
// Mostra a página em modo overlay (?overlay=1). Precisa do "npm run dev" a correr.
// O jogo tem de estar em "janela sem bordas" para o overlay aparecer por cima.
const { app, BrowserWindow, screen } = require("electron");

const URL = process.env.OVERLAY_URL || "http://localhost:5173/?overlay=1";

function createWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: 340,
    height: 300,
    x: width - 360,
    y: 40,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    hasShadow: false,
    title: "Forza Overlay",
    webPreferences: { contextIsolation: true },
  });
  win.setAlwaysOnTop(true, "screen-saver"); // fica por cima mesmo de jogos em janela sem bordas
  win.setVisibleOnAllWorkspaces(true);

  const load = () => win.loadURL(URL).catch(() => setTimeout(load, 2000)); // espera pelo Vite
  load();
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
