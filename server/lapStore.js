// Histórico de voltas por pista: data/laps/<id da pista>.jsonl, uma volta por linha.
// Acrescentar no fim de um ficheiro é barato, e uma linha estragada não afeta as outras.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = process.env.LAPS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "laps");

const fileFor = (trackId) => path.join(DIR, `${trackId.replace(/[^\w-]/g, "")}.jsonl`);

export function appendLap(trackId, lap) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.appendFileSync(fileFor(trackId), JSON.stringify(lap) + "\n");
}

export function readLaps(trackId) {
  let text;
  try {
    text = fs.readFileSync(fileFor(trackId), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const laps = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      laps.push(JSON.parse(line));
    } catch {
      // linha incompleta (ex.: programa fechado a meio da escrita): ignora
    }
  }
  return laps;
}

export function deleteLaps(trackId) {
  fs.rmSync(fileFor(trackId), { force: true });
}
