import dgram from "node:dgram";
import os from "node:os";
import { WebSocketServer } from "ws";
import { parsePacket } from "./parser.js";
import { LapTimer, START_RADIUS } from "./lapTimer.js";
import { TrackStore } from "./trackStore.js";
import { appendLap, deleteLaps, readLaps } from "./lapStore.js";
import { CarStore } from "./carStore.js";
import { SettingsStore } from "./settingsStore.js";

const UDP_PORT = Number(process.env.FORZA_PORT) || 8005;
const WS_PORT = Number(process.env.WS_PORT) || 8080;
const BROADCAST_MS = 33; // ~30 atualizações/s para a interface
const DETECT_RADIUS = START_RADIUS * 2; // carrega a pista antes de chegar à partida

const timer = new LapTimer();
const store = new TrackStore();
const cars = new CarStore();
const settings = new SettingsStore();

// Recorde, setores ou melhores setores mudaram numa pista guardada: grava logo no ficheiro.
timer.onTrackUpdate = () => {
  if (!timer.track) return;
  store.update(timer.track.id, { records: timer.records, sectors: timer.sectors, path: timer.trackPath });
  console.log(`[pistas] "${timer.track.name}" atualizada`);
  broadcastTracks();
};
// Cada volta fechada numa pista guardada vai para o histórico dessa pista.
timer.onLapComplete = (lap) => {
  if (!timer.track || !lap) return;
  appendLap(timer.track.id, lapRecord(lap));
  broadcastTracks();
};

function lapRecord(lap) {
  return {
    id: `${Date.now().toString(36)}-${lap.n}`,
    at: new Date().toISOString(),
    car: latest && { ordinal: latest.carOrdinal, class: latest.carClass, pi: latest.carPI },
    ms: lap.ms,
    color: lap.color,
    splits: lap.splits,
    splitIdx: lap.splitIdx,
    path: lap.path,
    samples: lap.samples, // para o delta, se esta volta voltar a ser recorde
  };
}

// Dados de uma pista guardada para o seletor: mapa, recordes por carro e voltas (sem traçados).
function trackView(id) {
  const track = store.get(id);
  if (!track) return null;
  const laps = readLaps(id).map(({ path, splitIdx, samples, ...lap }) => lap);

  // Carros com recorde ou com voltas nesta pista.
  const byCar = {};
  for (const [key, rec] of Object.entries(track.records ?? {})) {
    const b = rec.bestSectors ?? [null, null, null];
    byCar[key] = {
      key,
      recordMs: rec.best?.ms ?? null,
      refPath: rec.best?.path ?? null,
      bestSectors: b,
      possibleBestMs: b.every((ms) => ms != null) ? b[0] + b[1] + b[2] : null,
      lapCount: 0,
    };
  }
  for (const lap of laps) {
    const key = String(lap.car?.ordinal ?? "?");
    byCar[key] ??= { key, recordMs: null, refPath: null, bestSectors: [null, null, null], possibleBestMs: null, lapCount: 0 };
    byCar[key].lapCount++;
    if (lap.car) byCar[key].info = lap.car; // classe e PI da volta mais recente
  }

  return {
    id: track.id,
    name: track.name,
    start: track.start,
    sectors: track.sectors ?? null,
    path: track.path ?? null,
    cars: Object.values(byCar),
    laps,
  };
}

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

// Sem acesso na rede, o WebSocket só aceita ligações do próprio PC. Mudar exige reiniciar.
const lanAccess = settings.values.lanAccess;
const wss = new WebSocketServer({ port: WS_PORT, host: lanAccess ? undefined : "127.0.0.1" }, () =>
  console.log(`[ws] servidor em ws://localhost:${WS_PORT}${lanAccess ? " (acesso na rede ativo)" : ""}`),
);

// Endereços para abrir a página noutro dispositivo da mesma rede.
function lanUrls() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => `http://${i.address}:5173`);
}
if (lanAccess) console.log(`[rede] abre no telemóvel: ${lanUrls().join("  ou  ")}`);

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
  send(ws, { type: "cars", names: cars.names });
  send(ws, { type: "settings", values: settings.values });
  send(ws, { type: "network", lanActive: lanAccess, urls: lanAccess ? lanUrls() : [] });
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
    else if (msg.type === "getLap") {
      const lap = timer.getLap(msg.n);
      // Recorde do carro com que a volta foi feita, para o gráfico de comparação.
      const ref = lap && (timer.records[lap.car]?.best ?? (lap.car === timer.carKey ? timer.ref : null));
      send(ws, { type: "lap", n: msg.n, lap: lap && { ...lap, refMs: ref?.ms ?? null, refSamples: ref?.samples ?? null } });
    }
    else if (msg.type === "setSettings" && msg.patch) {
      settings.update(msg.patch);
      broadcast({ type: "settings", values: settings.values });
    } else if (msg.type === "nameCar" && msg.id != null) {
      cars.setName(String(msg.id), msg.name);
      broadcast({ type: "cars", names: cars.names });
    } else if (msg.type === "getTrackView") send(ws, { type: "trackView", view: trackView(msg.id) });
    else if (msg.type === "getSavedLap") {
      const lap = readLaps(msg.trackId).find((l) => l.id === msg.lapId) ?? null;
      const ref = lap && store.get(msg.trackId)?.records?.[String(lap.car?.ordinal ?? "?")]?.best;
      send(ws, { type: "savedLap", lap: lap && { ...lap, refMs: ref?.ms ?? null, refSamples: ref?.samples ?? null } });
    }
    else if (msg.type === "saveTrack" && timer.start && !timer.track) {
      const name = String(msg.name ?? "").trim().slice(0, 60) || `Pista ${store.tracks.length + 1}`;
      timer.commitRecord();
      const track = store.add({ name, start: timer.start, sectors: timer.sectors, path: timer.trackPath, records: timer.records });
      timer.track = { id: track.id, name: track.name };
      // As voltas desta sessão (antes de guardar) também entram no histórico da pista.
      for (const l of timer.laps) {
        const lap = timer.getLap(l.n);
        if (lap) appendLap(track.id, lapRecord(lap));
      }
      console.log(`[pistas] guardada: "${name}"`);
      broadcastTracks();
    } else if (msg.type === "loadTrack") {
      const track = store.get(msg.id);
      if (track) timer.loadTrack(track);
    } else if (msg.type === "deleteTrack") {
      store.remove(msg.id);
      deleteLaps(msg.id);
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
