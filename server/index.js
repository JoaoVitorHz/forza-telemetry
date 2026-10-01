import dgram from "node:dgram";
import { WebSocketServer } from "ws";
import { parsePacket } from "./parser.js";
import { LapTimer, START_RADIUS } from "./lapTimer.js";
import { TrackStore } from "./trackStore.js";

const UDP_PORT = Number(process.env.FORZA_PORT) || 8005;
const WS_PORT = Number(process.env.WS_PORT) || 8080;
const BROADCAST_MS = 33; // ~30 atualizações/s para a interface
const DETECT_RADIUS = START_RADIUS * 2; // carrega a pista antes de chegar à partida

const timer = new LapTimer();
const store = new TrackStore();

// Recorde, setores ou melhores setores mudaram numa pista guardada: grava logo no ficheiro.
timer.onTrackUpdate = () => {
  if (!timer.track) return;
  store.update(timer.track.id, { best: timer.ref, sectors: timer.sectors, bestSectors: [...timer.bestSectors] });
  console.log(`[pistas] "${timer.track.name}" atualizada`);
  broadcastTracks();
};
let latest = null;
let lastPacketAt = 0;
let loggedLength = false;

// Duas origens ao mesmo tempo (ex.: jogo + simulador) misturam posições e estragam as voltas.
const sources = new Map(); // "ip:porta" -> último pacote (ms)
let warnedMultiple = false;

const udp = dgram.createSocket("udp4");
udp.on("message", (buf, rinfo) => {
  if (!loggedLength) {
    console.log(`[udp] primeiro pacote recebido (${buf.length} bytes)`);
    loggedLength = true;
  }
  const now = Date.now();
  sources.set(`${rinfo.address}:${rinfo.port}`, now);
  for (const [key, at] of sources) if (now - at > 2000) sources.delete(key);
  if (sources.size > 1 && !warnedMultiple) {
    console.warn(`[udp] AVISO: a receber de ${sources.size} origens (${[...sources.keys()].join(", ")}). O simulador está aberto?`);
    warnedMultiple = true;
  } else if (sources.size === 1) {
    warnedMultiple = false;
  }
  const t = parsePacket(buf);
  if (!t) return;
  if (latest && t.isRaceOn) {
    if (timer.gameRace) {
      // Corrida do jogo sem pista associada: associa a pista guardada cuja partida esteja perto.
      const near = !timer.track && store.findNear(t, latest, DETECT_RADIUS);
      if (near) {
        timer.attachTrack(near);
        console.log(`[pistas] pista detetada na corrida: "${near.name}"`);
      }
    } else if (!timer.start || (timer.track && !timer.running)) {
      // Sem pista ativa (ou à espera da partida): procura uma pista guardada cuja partida esteja perto.
      const near = store.findNear(t, latest, DETECT_RADIUS, timer.track?.id);
      if (near) {
        timer.loadTrack(near);
        console.log(`[pistas] pista detetada: "${near.name}"`);
      }
    }
  }
  timer.update(t);
  latest = t;
  lastPacketAt = Date.now();
});
udp.on("error", (err) => {
  console.error("[udp]", err.message);
  process.exit(1);
});
udp.bind(UDP_PORT, () => console.log(`[udp] à escuta na porta ${UDP_PORT}`));

const wss = new WebSocketServer({ port: WS_PORT }, () =>
  console.log(`[ws] servidor em ws://localhost:${WS_PORT}`),
);

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of wss.clients) if (ws.readyState === ws.OPEN) ws.send(data);
}

function broadcastTracks() {
  broadcast({ type: "tracks", tracks: store.summary() });
}

wss.on("connection", (ws) => {
  send(ws, { type: "map", ...timer.mapData() });
  send(ws, { type: "tracks", tracks: store.summary() });
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "setStart" && latest) timer.setStart(latest);
    else if (msg.type === "reset") timer.reset();
    else if (msg.type === "togglePause") timer.manualPause = !timer.manualPause;
    else if (msg.type === "getLap") send(ws, { type: "lap", n: msg.n, lap: timer.getLap(msg.n) });
    else if (msg.type === "saveTrack" && timer.start && !timer.track) {
      const name = String(msg.name ?? "").trim().slice(0, 60) || `Pista ${store.tracks.length + 1}`;
      const track = store.add({ name, start: timer.start, best: timer.ref, sectors: timer.sectors, bestSectors: [...timer.bestSectors] });
      timer.track = { id: track.id, name: track.name };
      console.log(`[pistas] guardada: "${name}"`);
      broadcastTracks();
    } else if (msg.type === "loadTrack") {
      const track = store.get(msg.id);
      if (track) timer.loadTrack(track);
    } else if (msg.type === "deleteTrack") {
      store.remove(msg.id);
      if (timer.track?.id === msg.id) timer.track = null;
      broadcastTracks();
    }
  });
});

let sentMapVersion = -1;
setInterval(() => {
  if (wss.clients.size === 0) return;
  if (timer.mapVersion !== sentMapVersion) {
    broadcast({ type: "map", ...timer.mapData() });
    sentMapVersion = timer.mapVersion;
  }
  broadcast({
    type: "state",
    receiving: Date.now() - lastPacketAt < 1000,
    telemetry: latest && {
      speedKmh: latest.speed * 3.6,
      rpm: latest.rpm,
      maxRpm: latest.maxRpm,
      gear: latest.gear,
      throttle: latest.throttle / 255,
      brake: latest.brake / 255,
      carOrdinal: latest.carOrdinal,
      carClass: latest.carClass,
      carPI: latest.carPI,
      x: latest.x,
      z: latest.z,
    },
    timer: timer.snapshot(),
  });
}, BROADCAST_MS);
