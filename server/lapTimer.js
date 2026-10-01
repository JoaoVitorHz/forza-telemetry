// Cronómetro próprio: no Horizon os campos de volta do jogo vêm a zero fora de corridas oficiais,
// por isso as voltas são detetadas pela posição do carro em relação a uma linha de partida.

const START_RADIUS = 15; // m — distância à partida para contar a passagem
const ARM_DISTANCE = 50; // m — tem de se afastar isto da partida antes de poder fechar volta
const MIN_LAP_MS = 10_000;
const MAX_DT_MS = 500; // intervalo maior entre pacotes = falha/pausa, não conta tempo
const MAX_STEP_M = 50; // salto maior num pacote = teleporte/reinício, não conta distância
const PATH_STEP_M = 3;

export class LapTimer {
  constructor() {
    this.start = null;
    this.prev = null;
    this.paused = true;
    this.mapVersion = 0;
    this.resetLaps();
  }

  resetLaps() {
    this.lapNumber = 0;
    this.currentMs = 0;
    this.lapDist = 0;
    this.lastLapMs = null;
    this.bestLapMs = null;
    this.laps = [];
    this.samples = []; // [distância na volta, tempo] da volta atual
    this.bestSamples = null;
    this.path = [];
    this.refPath = null; // traçado da melhor volta (para o mapa)
    this.armed = false;
    this.prevStartDist = Infinity;
    this.mapVersion++;
  }

  reset() {
    this.start = null;
    this.resetLaps();
  }

  setStart(t) {
    this.resetLaps();
    this.start = { x: t.x, z: t.z };
    this.beginLap();
  }

  beginLap() {
    this.lapNumber++;
    this.currentMs = 0;
    this.lapDist = 0;
    this.samples = [[0, 0]];
    this.path = [{ ...this.start }];
    this.armed = false;
    this.prevStartDist = 0;
  }

  update(t) {
    const prev = this.prev;
    this.prev = t;
    this.paused = !t.isRaceOn;
    // Em pausa congela; ao retomar, o primeiro pacote só serve de referência (ressincroniza).
    if (!this.start || !t.isRaceOn || !prev || !prev.isRaceOn) return;

    const dt = t.timestampMs - prev.timestampMs;
    const step = Math.hypot(t.x - prev.x, t.z - prev.z);
    if (dt <= 0 || dt > MAX_DT_MS || step > MAX_STEP_M) return;

    this.currentMs += dt;
    this.lapDist += step;
    this.samples.push([this.lapDist, this.currentMs]);

    const last = this.path[this.path.length - 1];
    if (Math.hypot(t.x - last.x, t.z - last.z) >= PATH_STEP_M) this.path.push({ x: t.x, z: t.z });

    const d = Math.hypot(t.x - this.start.x, t.z - this.start.z);
    if (!this.armed && d > ARM_DISTANCE) this.armed = true;
    // Fecha a volta no ponto mais próximo da partida: dentro do raio e a começar a afastar-se.
    if (this.armed && d < START_RADIUS && d > this.prevStartDist && this.currentMs > MIN_LAP_MS) {
      this.completeLap();
    }
    this.prevStartDist = d;
  }

  completeLap() {
    const lap = this.currentMs;
    this.lastLapMs = lap;
    this.laps.push(lap);
    if (this.bestLapMs == null || lap < this.bestLapMs) {
      this.bestLapMs = lap;
      this.bestSamples = this.samples;
      this.refPath = this.path;
      this.mapVersion++;
    }
    this.beginLap();
  }

  // Delta = tempo atual − tempo da melhor volta à mesma distância percorrida.
  deltaMs() {
    const best = this.bestSamples;
    if (!best || best.length < 2 || this.lapDist > best[best.length - 1][0]) return null;
    let lo = 0;
    let hi = best.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (best[mid][0] <= this.lapDist) lo = mid;
      else hi = mid;
    }
    const [d0, t0] = best[lo];
    const [d1, t1] = best[hi];
    const refMs = d1 === d0 ? t0 : t0 + ((this.lapDist - d0) / (d1 - d0)) * (t1 - t0);
    return this.currentMs - refMs;
  }

  snapshot() {
    return {
      start: this.start,
      paused: this.paused,
      lapNumber: this.lapNumber,
      currentMs: this.currentMs,
      deltaMs: this.deltaMs(),
      lastLapMs: this.lastLapMs,
      bestLapMs: this.bestLapMs,
      laps: this.laps.slice(-10),
      mapVersion: this.mapVersion,
    };
  }

  mapData() {
    return { start: this.start, refPath: this.refPath, mapVersion: this.mapVersion };
  }
}
