// Grava pacotes brutos do jogo para analisar o formato.
// Uso: pára o "npm run dev", corre "npm run capture" e conduz durante 15 segundos.
import dgram from "node:dgram";
import fs from "node:fs";

const PORT = Number(process.env.FORZA_PORT) || 8005;
const SECONDS = 15;
const OUT = "capture.bin";

const packets = [];
const sock = dgram.createSocket("udp4");
sock.on("message", (buf) => {
  if (packets.length === 0) console.log(`[capture] a receber (${buf.length} bytes por pacote)… conduz!`);
  packets.push(Buffer.from(buf));
});
sock.bind(PORT, () => console.log(`[capture] à escuta na porta ${PORT} durante ${SECONDS}s`));

setTimeout(() => {
  const sizes = [...new Set(packets.map((p) => p.length))];
  // Formato: [uint16 tamanho][bytes] por pacote
  const out = Buffer.concat(
    packets.flatMap((p) => {
      const len = Buffer.alloc(2);
      len.writeUInt16LE(p.length);
      return [len, p];
    }),
  );
  fs.writeFileSync(OUT, out);
  console.log(`[capture] ${packets.length} pacotes, tamanhos: ${sizes.join(", ")} → ${OUT}`);
  process.exit(0);
}, SECONDS * 1000);
