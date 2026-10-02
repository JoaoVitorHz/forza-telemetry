import dgram from "node:dgram";
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
// Amostras das voltas guardadas de um carro numa pista (para a volta ideal).
timer.historySamples = (trackId, carKey) =>
  readLaps(trackId)
    .filter((lap) => String(lap.car?.ordinal ?? "?") === carKey && lap.samples)
    .map((lap) => lap.samples);
const applySettings = () => {
  timer.miniCount = settings.values.miniSectors ? settings.values.miniSectorCount : 0;
  timer.autoStart = settings.values.autoStart;
  timer.autoMinLength = settings.values.autoStartMinLength;
  timer.deltaMode = settings.values.deltaReference;
};
applySettings();

// Recorde, setores ou melhores setores mudaram numa pista guardada: grava logo no ficheiro.
timer.onTrackUpdate = () => {
  if (!timer.track) return;
  store.update(timer.track.id, { records: timer.records, sectors: timer.sectors, corners: timer.corners, path: timer.trackPath });
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
    corners: track.corners ?? null,
    path: track.path ?? null,
    cars: Object.values(byCar),
    laps,
  };
}

// Ficheiro de exportação: pista + recordes (+ histórico de voltas, opcional).
const EXPORT_FORMAT = "forza-telemetry-track";

function exportTrack(id, includeLaps) {
  const track = store.get(id);
  if (!track) return null;
  const { name, start, sectors, corners, path, records } = track;
  return {
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    carNames: cars.names,
    track: { name, start, sectors, corners, path, records },
    laps: includeLaps ? readLaps(id) : [],
  };
}

const isPoint = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);

// Importa sempre como pista nova (não mistura recordes de outra pessoa com os teus).
function importTrack(data) {
  if (data?.format !== EXPORT_FORMAT || !data.track || !isPoint(data.track.start)) {
    throw new Error("Ficheiro inválido: não é uma pista exportada por este programa.");
  }
  const t = data.track;
  const records = t.records && typeof t.records === "object" ? t.records : {};
  const name = `${String(t.name ?? "Pista").slice(0, 50)} (importada)`;
  const track = store.add({ name, start: t.start, sectors: t.sectors ?? null, corners: t.corners ?? null, path: t.path ?? null, records });
  for (const lap of Array.isArray(data.laps) ? data.laps : []) {
    if (Number.isFinite(lap?.ms)) appendLap(track.id, lap);
  }
  // Nomes de carros do ficheiro só entram se ainda não tiveres nome para esse carro.
  for (const [carId, carName] of Object.entries(data.carNames ?? {})) {
    if (!cars.names[carId]) cars.setName(carId, carName);
  }
  return track;
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
  if (t.isRaceOn) latest = t; // pacotes de pausa/retroceder vêm a zero (posição 0,0, carro 0)
  lastPacketAt = Date.now();
});
udp.on("error", (err) => {
  console.error("[udp]", err.message);
  process.exit(1);
});
udp.bind(UDP_PORT, () => console.log(`[udp] à escuta na porta ${UDP_PORT}`));

// Só aceita ligações do próprio PC.
const wss = new WebSocketServer({ port: WS_PORT, host: "127.0.0.1" }, () =>
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
  send(ws, { type: "cars", names: cars.names });
  send(ws, { type: "settings", values: settings.values });
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
      applySettings();
      broadcast({ type: "settings", values: settings.values });
    } else if (msg.type === "nameCar" && msg.id != null) {
      cars.setName(String(msg.id), msg.name);
      broadcast({ type: "cars", names: cars.names });
    } else if (msg.type === "exportTrack") {
      const data = exportTrack(msg.id, msg.includeLaps);
      if (data) send(ws, { type: "trackExport", fileName: `${data.track.name.replace(/[^\w-]+/g, "_")}.json`, data });
    } else if (msg.type === "importTrack") {
      try {
        const track = importTrack(msg.data);
        console.log(`[pistas] importada: "${track.name}"`);
        broadcastTracks();
        broadcast({ type: "cars", names: cars.names });
        send(ws, { type: "importResult", ok: true, name: track.name });
      } catch (err) {
        send(ws, { type: "importResult", ok: false, error: err.message });
      }
    } else if (msg.type === "getTrackView") send(ws, { type: "trackView", view: trackView(msg.id) });
    else if (msg.type === "getSavedLap") {
      const lap = readLaps(msg.trackId).find((l) => l.id === msg.lapId) ?? null;
      const ref = lap && store.get(msg.trackId)?.records?.[String(lap.car?.ordinal ?? "?")]?.best;
      send(ws, { type: "savedLap", lap: lap && { ...lap, refMs: ref?.ms ?? null, refSamples: ref?.samples ?? null } });
    }
    else if (msg.type === "saveTrack" && timer.start && !timer.track) {
      const name = String(msg.name ?? "").trim().slice(0, 60) || `Pista ${store.tracks.length + 1}`;
      timer.commitRecord();
      const track = store.add({
        name,
        start: timer.start,
        sectors: timer.sectors,
        corners: timer.corners,
        path: timer.trackPath,
        records: timer.records,
      });
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
