import dgram from "node:dgram";
import { WebSocketServer } from "ws";
import { parsePacket } from "./parser.js";
import { LapTimer } from "./lapTimer.js";

const UDP_PORT = Number(process.env.FORZA_PORT) || 8005;
const WS_PORT = Number(process.env.WS_PORT) || 8080;
const BROADCAST_MS = 33; // ~30 atualizações/s para a interface

const timer = new LapTimer();
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

wss.on("connection", (ws) => {
  send(ws, { type: "map", ...timer.mapData() });
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "setStart" && latest) timer.setStart(latest);
    else if (msg.type === "reset") timer.reset();
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
