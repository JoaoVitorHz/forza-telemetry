// Simulador: envia pacotes no formato do Forza Horizon (324 bytes) para testar sem o jogo.
// Uso: npm run sim            (tempo real)
//      SIM_RATE=20 npm run sim (20x mais rápido, para testar voltas)
import dgram from "node:dgram";

const PORT = Number(process.env.FORZA_PORT) || 8005;
const RATE = Number(process.env.SIM_RATE) || 1;
const TICK_MS = 1000 / 60;

// Circuito fechado paramétrico (~3,5 km)
const track = (a) => ({
  x: 600 * Math.cos(a) + 150 * Math.cos(3 * a),
  z: 400 * Math.sin(a) + 100 * Math.sin(2 * a),
});

const sock = dgram.createSocket("udp4");
let angle = 0;
let ts = 0;
let lapFactor = 1;

function tick() {
  const speed = (45 + 15 * Math.sin(2 * angle)) * lapFactor; // m/s
  const p = track(angle);
  const p2 = track(angle + 0.001);
  const metersPerRad = Math.hypot(p2.x - p.x, p2.z - p.z) / 0.001;
  angle += (speed * (TICK_MS / 1000)) / metersPerRad;
  if (angle >= Math.PI * 2) {
    angle -= Math.PI * 2;
    lapFactor = 0.97 + Math.random() * 0.06; // cada volta um pouco diferente
  }
  ts += TICK_MS;

  const buf = Buffer.alloc(324); // novo buffer por pacote: send() é assíncrono
  const rpm = 3000 + (speed / 60) * 4000;
  buf.writeInt32LE(1, 0);
  buf.writeUInt32LE(Math.round(ts) >>> 0, 4);
  buf.writeFloatLE(8000, 8);
  buf.writeFloatLE(rpm, 16);
  buf.writeInt32LE(1234, 212);
  buf.writeInt32LE(5, 216);
  buf.writeInt32LE(900, 220);
  buf.writeFloatLE(p.x, 244);
  buf.writeFloatLE(0, 248);
  buf.writeFloatLE(p.z, 252);
  buf.writeFloatLE(speed, 256);
  buf.writeUInt8(Math.cos(2 * angle) > 0 ? 255 : 60, 315);
  buf.writeUInt8(Math.cos(2 * angle) < -0.7 ? 200 : 0, 316);
  buf.writeUInt8(Math.min(6, 2 + Math.floor(speed / 12)), 319);
  sock.send(buf, PORT, "127.0.0.1");
}

const steps = Math.max(1, Math.round(RATE));
setInterval(() => {
  for (let i = 0; i < steps; i++) tick();
}, TICK_MS);
console.log(`[sim] a enviar para 127.0.0.1:${PORT} (${steps}x)`);
