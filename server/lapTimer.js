// Cronómetro próprio: no Horizon os campos de volta do jogo vêm a zero fora de corridas oficiais,
// por isso as voltas são detetadas pela posição do carro em relação a uma linha de partida.

export const START_RADIUS = 15; // m — distância à partida para contar a passagem
const ARM_DISTANCE = 50; // m — tem de se afastar isto da partida antes de poder fechar volta
const MIN_LAP_MS = 10_000;
const MAX_DT_MS = 500; // intervalo maior entre pacotes = falha/pausa, não conta tempo
const MAX_STEP_M = 50; // salto maior num pacote = teleporte/reinício, não conta distância
const PATH_STEP_M = 3;
const SAMPLE_STEP_M = 2; // resolução das amostras guardadas para o delta

const round1 = (v) => Math.round(v * 10) / 10;

// Verdadeiro se o movimento prev→t vai no sentido da partida (ou se o sentido ainda é desconhecido).
export function headingOk(start, prev, t) {
  if (!start.dir || !prev) return true;
  return (t.x - prev.x) * start.dir.x + (t.z - prev.z) * start.dir.z > 0;
}

export class LapTimer {
  constructor() {
    this.prev = null;
    this.paused = true;
    this.mapVersion = 0;
    this.gameRace = false; // numa corrida oficial: os tempos vêm do próprio jogo
    this.gameLap = 0;
    this.onRecord = null; // chamado quando a volta de referência (recorde) melhora
    this.reset();
  }

  reset() {
    this.track = null; // { id, name } se a pista estiver guardada
    this.start = null; // { x, z, dir: { x, z } | null }
    this.ref = null; // recorde: { ms, samples: [[dist, ms]], path: [{x, z}] }
    this.resetLaps();
  }

  resetLaps() {
    this.running = false;
    this.lapNumber = 0;
    this.currentMs = 0;
    this.lapDist = 0;
    this.lastLapMs = null;
    this.sessionBestMs = null;
    this.laps = [];
    this.samples = [];
    this.path = [];
    this.armed = false;
    this.prevStartDist = Infinity;
    this.mapVersion++;
  }

  // Partida manual no sítio onde o carro está; a volta começa já.
  setStart(t) {
    this.reset();
    this.start = { x: t.x, z: t.z, dir: null };
    this.beginLap();
  }

  // Pista guardada: fica à espera de o carro passar na partida para começar.
  loadTrack(track) {
    this.reset();
    this.track = { id: track.id, name: track.name };
    this.start = track.start;
    this.ref = track.best ?? null;
  }

  // Associa uma pista guardada a meio de uma corrida, sem perder as voltas já feitas.
  attachTrack(track) {
    this.track = { id: track.id, name: track.name };
    this.start = track.start;
    if (track.best && (!this.ref || track.best.ms <= this.ref.ms)) this.ref = track.best;
    else if (this.ref) this.onRecord?.(this); // o recorde desta corrida já é melhor que o guardado
    this.mapVersion++;
  }

  beginLap(pos = this.start) {
    this.running = true;
    this.lapNumber++;
    this.currentMs = 0;
    this.lapDist = 0;
    this.samples = [[0, 0]];
    this.path = [{ x: pos.x, z: pos.z }];
    this.armed = false;
    this.prevStartDist = 0;
  }

  update(t) {
    const prev = this.prev;
    this.prev = t;
    this.paused = !t.isRaceOn;
    if (!t.isRaceOn) return;

    // Corrida oficial: o jogo envia os tempos de volta; fora dela vêm a zero.
    const inRace = t.currentRaceTime > 0;
    if (inRace && !this.gameRace) this.enterRace(t);
    else if (!inRace && this.gameRace) this.leaveRace();

    // Em pausa congela; ao retomar, o primeiro pacote só serve de referência (ressincroniza).
    if (!prev || !prev.isRaceOn) return;
    const dt = t.timestampMs - prev.timestampMs;
    const step = Math.hypot(t.x - prev.x, t.z - prev.z);
    const validStep = dt > 0 && dt <= MAX_DT_MS && step <= MAX_STEP_M;

    if (this.gameRace) {
      this.updateRace(t, prev, validStep ? step : 0);
      return;
    }
    if (!this.start || !validStep) return;

    // Partida manual com o carro parado: o sentido da pista é o do primeiro movimento.
    if (!this.start.dir && step > 0.1) {
      this.start.dir = { x: (t.x - prev.x) / step, z: (t.z - prev.z) / step };
    }

    const d = Math.hypot(t.x - this.start.x, t.z - this.start.z);
    // Passagem na partida = ponto mais próximo dela (dentro do raio e a começar a afastar-se).
    const crossing = d < START_RADIUS && d > this.prevStartDist && headingOk(this.start, prev, t);
    this.prevStartDist = d;

    if (!this.running) {
      if (crossing) this.beginLap();
      return;
    }

    this.currentMs += dt;
    this.advance(t, step);

    if (!this.armed && d > ARM_DISTANCE) this.armed = true;
    if (this.armed && crossing && this.currentMs > MIN_LAP_MS) this.completeLap();
  }

  enterRace(t) {
    this.gameRace = true;
    this.gameLap = t.lapNumber;
    this.resetLaps();
    this.beginLap(t);
  }

  leaveRace() {
    this.gameRace = false;
    this.running = false; // volta à deteção pela partida (se houver uma)
    this.prevStartDist = Infinity;
  }

  updateRace(t, prev, step) {
    if (!this.running) this.beginLap(t); // ex.: depois de Reiniciar a meio da corrida
    if (t.lapNumber > this.gameLap && t.lastLap > 0) {
      this.gameLap = t.lapNumber;
      // A linha de meta do jogo passa a ser a partida (para o mapa e para guardar a pista).
      if (!this.start) {
        const dir = step > 0.1 ? { x: (t.x - prev.x) / step, z: (t.z - prev.z) / step } : null;
        this.start = { x: t.x, z: t.z, dir };
        this.mapVersion++;
      }
      this.completeLap(Math.round(t.lastLap * 1000), t);
      return;
    }
    this.gameLap = t.lapNumber;
    this.currentMs = Math.round(t.currentLap * 1000);
    if (step > 0) this.advance(t, step);
  }

  // Acumula distância, amostras para o delta e traçado da volta atual.
  advance(t, step) {
    this.lapDist += step;
    this.samples.push([this.lapDist, this.currentMs]);
    const last = this.path[this.path.length - 1];
    if (Math.hypot(t.x - last.x, t.z - last.z) >= PATH_STEP_M) this.path.push({ x: t.x, z: t.z });
  }

  completeLap(lap = this.currentMs, pos = this.start) {
    this.lastLapMs = lap;
    this.laps.push(lap);
    if (this.sessionBestMs == null || lap < this.sessionBestMs) this.sessionBestMs = lap;
    if (!this.ref || lap < this.ref.ms) {
      this.ref = { ms: lap, samples: downsample(this.samples), path: this.path.map((p) => ({ x: round1(p.x), z: round1(p.z) })) };
      this.mapVersion++;
      this.onRecord?.(this);
    }
    this.beginLap(pos);
  }

  // Delta = tempo atual − tempo do recorde à mesma distância percorrida.
  deltaMs() {
    const best = this.ref?.samples;
    if (!this.running || !best || best.length < 2 || this.lapDist > best[best.length - 1][0]) return null;
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
      track: this.track,
      start: this.start,
      paused: this.paused,
      running: this.running,
      gameTiming: this.gameRace,
      lapNumber: this.lapNumber,
      currentMs: this.currentMs,
      deltaMs: this.deltaMs(),
      lastLapMs: this.lastLapMs,
      sessionBestMs: this.sessionBestMs,
      recordMs: this.ref?.ms ?? null,
      laps: this.laps.slice(-10),
      mapVersion: this.mapVersion,
    };
  }

  mapData() {
    return { start: this.start, refPath: this.ref?.path ?? null, mapVersion: this.mapVersion };
  }
}

function downsample(samples) {
  const out = [];
  let lastDist = -Infinity;
  for (const [dist, ms] of samples) {
    if (dist - lastDist >= SAMPLE_STEP_M) {
      out.push([round1(dist), ms]);
      lastDist = dist;
    }
  }
  const lastSample = samples[samples.length - 1];
  if (out[out.length - 1][1] !== lastSample[1]) out.push([round1(lastSample[0]), lastSample[1]]);
  return out;
}
