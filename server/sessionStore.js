// Histórico de sessões: todas as voltas (de qualquer pista, guardada ou não, incluindo parciais e
// inválidas) com a telemetria, em data/sessions/<id>.jsonl. Uma sessão acaba quando se passam
// SESSION_GAP_MS sem nenhuma volta; reiniciar o servidor continua a mesma sessão.
// data/sessions/index.json guarda o resumo de cada sessão para a lista não ter de ler tudo.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = process.env.SESSIONS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "sessions");
const INDEX = path.join(DIR, "index.json");
const SESSION_GAP_MS = 30 * 60 * 1000;

const fileFor = (id) => path.join(DIR, `${id.replace(/[^\w-]/g, "")}.jsonl`);

export class SessionStore {
  constructor() {
    this.index = {};
    try {
      this.index = JSON.parse(fs.readFileSync(INDEX, "utf8"));
    } catch (err) {
      if (err.code !== "ENOENT") console.error("[sessões] erro a ler index.json:", err.message);
    }
    // Continua a última sessão se acabou há pouco (ex.: servidor reiniciado a meio).
    const last = Object.values(this.index).sort((a, b) => b.endedAt.localeCompare(a.endedAt))[0];
    this.current = last && Date.now() - Date.parse(last.endedAt) < SESSION_GAP_MS ? last.id : null;
  }

  saveIndex() {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = `${INDEX}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.index));
    fs.renameSync(tmp, INDEX);
  }

  // Grava uma volta na sessão atual (cria uma nova se a anterior já acabou).
  append(lap, now = new Date()) {
    const cur = this.current && this.index[this.current];
    if (!cur || now - Date.parse(cur.endedAt) > SESSION_GAP_MS) {
      const id = now.toISOString().replace(/[:.]/g, "-");
      this.index[id] = { id, startedAt: now.toISOString(), endedAt: now.toISOString(), laps: 0, tracks: {}, cars: {}, best: {} };
      this.current = id;
    }
    const s = this.index[this.current];
    fs.mkdirSync(DIR, { recursive: true });
    fs.appendFileSync(fileFor(s.id), JSON.stringify({ ...lap, sessionId: s.id }) + "\n");

    s.endedAt = now.toISOString();
    s.laps++;
    const track = lap.trackName ?? "Pista não guardada";
    const car = String(lap.car?.ordinal ?? "?");
    s.tracks[track] = (s.tracks[track] ?? 0) + 1;
    s.cars[car] = (s.cars[car] ?? 0) + 1;
    if (!lap.partial && !lap.invalid && lap.ms > 0) {
      const key = `${track}|${car}`;
      if (s.best[key] == null || lap.ms < s.best[key]) s.best[key] = lap.ms;
    }
    this.saveIndex();
  }

  // Primeira vez: cria as sessões a partir do histórico das pistas guardadas (voltas ordenadas pela
  // hora; mais de 30 min sem voltas = sessão nova).
  importHistory(entries) {
    const laps = entries
      .flatMap(({ track, laps }) => laps.map((lap) => ({ ...lap, trackId: track.id, trackName: track.name })))
      .filter((lap) => lap.at)
      .sort((a, b) => a.at.localeCompare(b.at));
    this.current = null;
    for (const lap of laps) this.append(lap, new Date(lap.at));
    const last = this.current && this.index[this.current];
    if (last && Date.now() - Date.parse(last.endedAt) >= SESSION_GAP_MS) this.current = null;
    return laps.length;
  }

  // Apaga voltas de uma sessão (ou a sessão inteira se ids = null). Devolve as voltas apagadas.
  remove(id, ids = null) {
    const laps = this.read(id);
    const gone = ids ? laps.filter((l) => ids.has(l.id)) : laps;
    const keep = ids ? laps.filter((l) => !ids.has(l.id)) : [];
    if (!keep.length) {
      fs.rmSync(fileFor(id), { force: true });
      delete this.index[id];
      if (this.current === id) this.current = null;
    } else {
      const tmp = `${fileFor(id)}.tmp`;
      fs.writeFileSync(tmp, keep.map((l) => JSON.stringify(l) + "\n").join(""));
      fs.renameSync(tmp, fileFor(id));
      this.index[id] = this.summarize(this.index[id], keep);
    }
    this.saveIndex();
    return gone;
  }

  // Resumo de uma sessão (para a lista) a partir das voltas que tem.
  summarize(base, laps) {
    const s = { ...base, laps: laps.length, tracks: {}, cars: {}, best: {} };
    for (const lap of laps) {
      const track = lap.trackName ?? "Pista não guardada";
      const car = String(lap.car?.ordinal ?? "?");
      s.tracks[track] = (s.tracks[track] ?? 0) + 1;
      s.cars[car] = (s.cars[car] ?? 0) + 1;
      if (!lap.partial && !lap.invalid && lap.ms > 0) {
        const key = `${track}|${car}`;
        if (s.best[key] == null || lap.ms < s.best[key]) s.best[key] = lap.ms;
      }
    }
    return s;
  }

  list() {
    return Object.values(this.index).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  read(id) {
    let text;
    try {
      text = fs.readFileSync(fileFor(id), "utf8");
    } catch {
      return [];
    }
    const laps = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        laps.push(JSON.parse(line));
      } catch {
        // linha incompleta: ignora
      }
    }
    return laps;
  }
}
