// Pistas guardadas em data/tracks.json: partida, sentido, setores, traçado do mapa e recordes por carro.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { headingOk } from "./lapTimer.js";
import { readLaps } from "./lapStore.js";

const FILE = process.env.TRACKS_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "tracks.json");

export class TrackStore {
  constructor() {
    this.tracks = [];
    try {
      this.tracks = JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch (err) {
      if (err.code !== "ENOENT") console.error("[pistas] erro a ler tracks.json:", err.message);
    }
    if (this.tracks.map((t) => [migrate(t), reconcile(t)].some(Boolean)).some(Boolean)) this.save();
    console.log(`[pistas] ${this.tracks.length} pista(s) guardada(s)`);
  }

  save() {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.tracks));
    fs.renameSync(tmp, FILE); // escrita atómica: nunca fica um ficheiro meio escrito
  }

  summary() {
    return this.tracks.map((t) => ({ id: t.id, name: t.name, recordMs: bestOfAllCars(t) }));
  }

  get(id) {
    return this.tracks.find((t) => t.id === id);
  }

  add(fields) {
    const track = { id: Date.now().toString(36), ...fields, createdAt: new Date().toISOString() };
    this.tracks.push(track);
    this.save();
    return track;
  }

  update(id, patch) {
    const track = this.get(id);
    if (!track) return;
    Object.assign(track, patch);
    this.save();
  }

  remove(id) {
    this.tracks = this.tracks.filter((t) => t.id !== id);
    this.save();
  }

  // Pista cuja partida está perto do carro e no mesmo sentido em que ele se move.
  findNear(t, prev, radius, excludeId) {
    return this.tracks.find(
      (tr) =>
        tr.id !== excludeId &&
        Math.hypot(t.x - tr.start.x, t.z - tr.start.z) < radius &&
        headingOk(tr.start, prev, t),
    );
  }
}

function bestOfAllCars(track) {
  const times = Object.values(track.records ?? {})
    .map((r) => r.best?.ms)
    .filter((ms) => ms != null);
  return times.length ? Math.min(...times) : null;
}

// Pistas antigas tinham um recorde único (best/bestSectors). Passa a ser o recorde do carro
// mais usado no histórico dessa pista. Devolve true se alterou a pista.
function migrate(track) {
  if (track.records || !("best" in track)) return false;
  const counts = {};
  for (const lap of readLaps(track.id)) {
    if (lap.car?.ordinal != null) counts[lap.car.ordinal] = (counts[lap.car.ordinal] ?? 0) + 1;
  }
  const car = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "?";
  track.records = track.best ? { [car]: { best: track.best, bestSectors: track.bestSectors ?? [null, null, null] } } : {};
  track.path = track.best?.path ?? null;
  delete track.best;
  delete track.bestSectors;
  return true;
}

// Confere os recordes com o histórico de voltas: se o histórico tiver uma volta mais rápida
// ou um setor melhor do que o guardado (ex.: recorde perdido), repõe-no. Devolve true se alterou.
function reconcile(track) {
  let changed = false;
  if (track.records && ("best" in track || "bestSectors" in track)) {
    delete track.best; // restos do formato antigo
    delete track.bestSectors;
    changed = true;
  }
  track.records ??= {};
  for (const lap of readLaps(track.id)) {
    if (lap.ms == null) continue;
    const key = String(lap.car?.ordinal ?? "?");
    const rec = (track.records[key] ??= { best: null, bestSectors: [null, null, null] });
    rec.bestSectors ??= [null, null, null];
    if (lap.path && (rec.best == null || lap.ms < rec.best.ms)) {
      rec.best = { ms: lap.ms, samples: lap.samples ?? null, path: lap.path };
      changed = true;
    }
    lap.splits?.forEach((split, i) => {
      if (split?.ms != null && (rec.bestSectors[i] == null || split.ms < rec.bestSectors[i])) {
        rec.bestSectors[i] = split.ms;
        changed = true;
      }
    });
  }
  if (changed) console.log(`[pistas] recordes de "${track.name}" conferidos com o histórico`);
  return changed;
}
