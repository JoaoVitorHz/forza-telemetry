// Pistas guardadas em data/tracks.json: partida, sentido e recorde (tempo, amostras do delta, traçado).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { headingOk } from "./lapTimer.js";

const FILE = process.env.TRACKS_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "tracks.json");

export class TrackStore {
  constructor() {
    this.tracks = [];
    try {
      this.tracks = JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch (err) {
      if (err.code !== "ENOENT") console.error("[pistas] erro a ler tracks.json:", err.message);
    }
    console.log(`[pistas] ${this.tracks.length} pista(s) guardada(s)`);
  }

  save() {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.tracks));
    fs.renameSync(tmp, FILE); // escrita atómica: nunca fica um ficheiro meio escrito
  }

  summary() {
    return this.tracks.map((t) => ({ id: t.id, name: t.name, recordMs: t.best?.ms ?? null }));
  }

  get(id) {
    return this.tracks.find((t) => t.id === id);
  }

  add({ name, start, best }) {
    const track = { id: Date.now().toString(36), name, start, best, createdAt: new Date().toISOString() };
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
