// Cronómetro próprio: no Horizon os campos de volta do jogo vêm a zero fora de corridas oficiais,
// por isso as voltas são detetadas pela posição do carro em relação a uma linha de partida.

export const START_RADIUS = 15; // m — distância à partida para contar a passagem
const ARM_DISTANCE = 50; // m — tem de se afastar isto da partida antes de poder fechar volta
const MIN_LAP_MS = 10_000;
const MAX_LAP_HISTORY = 50;
const MAX_DT_MS = 500; // intervalo maior entre pacotes = falha/pausa, não conta tempo
const MAX_STEP_M = 50; // salto maior num pacote = teleporte/reinício, não conta distância
const PATH_STEP_M = 3;
const SAMPLE_STEP_M = 2; // resolução das amostras guardadas para o delta
const GATE_RADIUS = 30; // m — largura máxima da "linha" de cada setor

const round1 = (v) => Math.round(v * 10) / 10;
const emptySectors = () => [null, null, null];

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
    this.manualPause = false; // botão Pausar: ignora os pacotes até retomar
    this.carKey = null; // ID do carro atual (recordes e setores são por carro)
    this.onTrackUpdate = null; // chamado quando recorde, setores ou melhores setores mudam
    this.onLapComplete = null; // chamado com cada volta fechada (com traçado), para o histórico
    this.reset();
  }

  reset() {
    this.track = null; // { id, name } se a pista estiver guardada
    this.start = null; // { x, z, dir: { x, z } | null }
    this.sectors = null; // divisões S1/S2: [{ x, z, dir }, { x, z, dir }]
    this.trackPath = null; // traçado da pista para o mapa (de qualquer carro)
    this.records = {}; // por carro: { [carKey]: { best, bestSectors } }
    this.applyCar();
    this.resetLaps();
  }

  // Recorde e melhores setores do carro atual:
  // ref = { ms, samples: [[dist, ms]], path: [{x, z}] }, bestSectors = [ms, ms, ms]
  applyCar() {
    const record = this.records[this.carKey];
    this.ref = record?.best ?? null;
    this.bestSectors = [...(record?.bestSectors ?? emptySectors())];
  }

  // Grava o recorde/melhores setores do carro atual na tabela de recordes da pista.
  commitRecord() {
    if (this.carKey == null) return;
    this.records[this.carKey] = { best: this.ref, bestSectors: [...this.bestSectors] };
    if (!this.trackPath && this.ref) this.trackPath = this.ref.path;
  }

  // Troca de carro: passa a comparar com os recordes desse carro e começa uma sessão nova para ele.
  setCar(key) {
    if (key === this.carKey) return;
    const first = this.carKey == null;
    this.carKey = key;
    this.applyCar();
    if (first) return;
    this.sessionBestMs = null;
    this.sessionSectors = emptySectors();
    if (!this.gameRace) this.running = false; // espera pela próxima passagem na partida
    this.prevStartDist = Infinity;
    this.mapVersion++;
  }

  resetLaps() {
    this.running = false;
    this.lapNumber = 0;
    this.currentMs = 0;
    this.lapDist = 0;
    this.lastLapMs = null;
    this.sessionBestMs = null;
    this.sessionSectors = emptySectors();
    this.splits = [];
    this.lastSplits = [];
    this.laps = [];
    this.lapPaths = new Map(); // n.º da volta -> { path, splitIdx } (pedido a pedido, não vai no estado)
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
    this.sectors = track.sectors ?? null;
    this.trackPath = track.path ?? null;
    this.records = structuredClone(track.records ?? {});
    this.applyCar();
    if (this.ensureSectors()) this.onTrackUpdate?.(this);
  }

  // Associa uma pista guardada a meio de uma corrida, sem perder as voltas já feitas.
  // Fica o melhor de cada lado (guardado ou desta corrida) e o resultado é gravado.
  attachTrack(track) {
    this.track = { id: track.id, name: track.name };
    this.start = track.start;
    this.sectors = track.sectors ?? this.sectors;
    this.trackPath = track.path ?? this.trackPath;
    const saved = track.records?.[this.carKey];
    if (saved?.best && (!this.ref || saved.best.ms <= this.ref.ms)) this.ref = saved.best;
    const savedSectors = saved?.bestSectors ?? emptySectors();
    this.bestSectors = this.bestSectors.map((ms, i) => minOrNull(ms, savedSectors[i]));
    this.records = { ...structuredClone(track.records ?? {}) };
    this.commitRecord();
    this.ensureSectors();
    this.mapVersion++;
    this.onTrackUpdate?.(this);
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
    this.splits = [];
    this.splitIdx = []; // índice no traçado onde cada setor fechou (para colorir o mapa)
    this.nextGate = 0;
    this.gatePrevSide = null;
    this.splitAtMs = 0;
  }

  update(t) {
    const prev = this.prev;
    this.prev = t;
    this.paused = !t.isRaceOn;
    if (!t.isRaceOn || this.manualPause) return;
    this.setCar(String(t.carOrdinal));

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

    const prevMs = this.currentMs;
    this.currentMs += dt;
    this.advance(t, step, prevMs);

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
    const prevMs = this.currentMs;
    this.currentMs = Math.round(t.currentLap * 1000);
    if (step > 0) this.advance(t, step, prevMs);
  }

  // Acumula distância, amostras para o delta e traçado da volta atual, e verifica os setores.
  advance(t, step, prevMs) {
    this.lapDist += step;
    // [distância, tempo, km/h, acelerador %, travão %] — delta e gráfico de comparação
    this.samples.push([
      this.lapDist,
      this.currentMs,
      Math.round(t.speed * 3.6),
      Math.round(t.throttle / 2.55),
      Math.round(t.brake / 2.55),
    ]);
    const last = this.path[this.path.length - 1];
    if (Math.hypot(t.x - last.x, t.z - last.z) >= PATH_STEP_M) this.path.push({ x: t.x, z: t.z });
    this.checkGate(t, prevMs);
  }

  // Cada divisão de setor é uma linha perpendicular à pista; o setor fecha quando o carro a cruza.
  checkGate(t, prevMs) {
    if (!this.sectors || this.nextGate > 1) return;
    const g = this.sectors[this.nextGate];
    const side = (t.x - g.x) * g.dir.x + (t.z - g.z) * g.dir.z;
    const near = Math.hypot(t.x - g.x, t.z - g.z) < GATE_RADIUS;
    if (near && this.gatePrevSide != null && this.gatePrevSide < 0 && side >= 0) {
      // Interpola o instante exato da passagem entre os dois pacotes.
      const f = this.gatePrevSide / (this.gatePrevSide - side);
      const at = prevMs + f * (this.currentMs - prevMs);
      this.recordSplit(this.nextGate, at - this.splitAtMs);
      this.splitAtMs = at;
      this.splitIdx[this.nextGate] = this.path.length - 1;
      this.nextGate++;
      this.gatePrevSide = null;
      return;
    }
    this.gatePrevSide = near ? side : null;
  }

  // Cores estilo F1: roxo = melhor de sempre, verde = melhor da sessão, amarelo = mais lento.
  recordSplit(i, ms) {
    ms = Math.round(ms);
    const best = this.bestSectors[i];
    const session = this.sessionSectors[i];
    const color = best == null || ms < best ? "purple" : session == null || ms < session ? "green" : "yellow";
    this.splits[i] = { ms, color, deltaMs: best == null ? null : ms - best };
    if (session == null || ms < session) this.sessionSectors[i] = ms;
    if (best == null || ms < best) this.bestSectors[i] = ms;
  }

  completeLap(lap = this.currentMs, pos = this.start) {
    // S3 = resto da volta (só se S1 e S2 foram registados nesta volta).
    if (this.splits[0] && this.splits[1]) this.recordSplit(2, lap - this.splitAtMs);
    let changed = this.splits.some((s) => s?.color === "purple"); // novo melhor setor de sempre
    this.lastSplits = this.splits;

    // Histórico com as cores do momento (como nos ecrãs de tempos da F1).
    const lapColor =
      !this.ref || lap < this.ref.ms ? "purple" : this.sessionBestMs == null || lap < this.sessionBestMs ? "green" : "yellow";
    this.laps.push({ n: this.lapNumber, ms: lap, color: lapColor, splits: this.splits, car: this.carKey });
    this.path.push({ x: pos.x, z: pos.z });
    const lapPath = this.path.map((p) => ({ x: round1(p.x), z: round1(p.z) }));
    const lapSamples = downsample(this.samples);
    this.lapPaths.set(this.lapNumber, { path: lapPath, splitIdx: this.splitIdx, samples: lapSamples });
    if (this.laps.length > MAX_LAP_HISTORY) this.lapPaths.delete(this.laps.shift().n);

    this.lastLapMs = lap;
    if (this.sessionBestMs == null || lap < this.sessionBestMs) this.sessionBestMs = lap;
    if (!this.ref || lap < this.ref.ms) {
      this.ref = { ms: lap, samples: lapSamples, path: lapPath };
      this.mapVersion++;
      changed = true;
    }
    if (this.ensureSectors()) changed = true;
    if (changed) {
      this.commitRecord();
      this.onTrackUpdate?.(this);
    }
    this.onLapComplete?.(this.getLap(this.lapNumber));
    this.beginLap(pos);
  }

  // Cria as divisões S1/S2 (a 1/3 e 2/3 do traçado de referência) se ainda não existirem.
  ensureSectors() {
    const path = this.ref?.path ?? this.trackPath;
    if (this.sectors || !path || path.length < 10) return false;
    this.sectors = computeSectors(path);
    this.mapVersion++;
    return true;
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

  // Fantasma: onde estaria o carro do recorde com o mesmo tempo de volta.
  ghost() {
    const ref = this.ref;
    if (!this.running || !ref?.samples?.length || !ref.path?.length) return null;
    const samples = ref.samples;
    if (this.currentMs >= samples[samples.length - 1][1]) return null;
    // Distância do recorde neste instante (as amostras estão ordenadas por tempo).
    let lo = 0;
    let hi = samples.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid][1] <= this.currentMs) lo = mid;
      else hi = mid;
    }
    const [d0, t0] = samples[lo];
    const [d1, t1] = samples[hi];
    const dist = t1 === t0 ? d0 : d0 + ((this.currentMs - t0) / (t1 - t0)) * (d1 - d0);
    const pos = pointAtDistance(ref, dist);
    return pos && { ...pos, gapM: Math.round(dist - this.lapDist) };
  }

  snapshot() {
    const b = this.bestSectors;
    return {
      track: this.track,
      car: this.carKey,
      start: this.start,
      paused: this.paused,
      running: this.running,
      gameTiming: this.gameRace,
      lapNumber: this.lapNumber,
      currentMs: this.currentMs,
      deltaMs: this.deltaMs(),
      ghost: this.ghost(),
      lastLapMs: this.lastLapMs,
      sessionBestMs: this.sessionBestMs,
      recordMs: this.ref?.ms ?? null,
      laps: this.laps,
      manualPause: this.manualPause,
      sectors: {
        enabled: !!this.sectors,
        current: this.splits,
        last: this.lastSplits,
        best: b,
        possibleBestMs: b.every((ms) => ms != null) ? b[0] + b[1] + b[2] : null,
      },
      mapVersion: this.mapVersion,
    };
  }

  // Volta do histórico com o traçado, para ver no mapa.
  getLap(n) {
    const lap = this.laps.find((l) => l.n === n);
    const detail = this.lapPaths.get(n);
    return lap && detail ? { ...lap, ...detail } : null;
  }

  mapData() {
    return { start: this.start, refPath: this.ref?.path ?? this.trackPath, sectors: this.sectors, mapVersion: this.mapVersion };
  }
}

// Ponto do traçado do recorde à distância d (comprimentos acumulados guardados em cache).
const cumCache = new WeakMap();
function pointAtDistance(ref, d) {
  const path = ref.path;
  let cum = cumCache.get(ref);
  if (!cum) {
    cum = [0];
    for (let i = 1; i < path.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
    }
    cumCache.set(ref, cum);
  }
  if (d <= 0) return { x: path[0].x, z: path[0].z };
  let lo = 1;
  let hi = cum.length - 1;
  if (d >= cum[hi]) return { x: path[hi].x, z: path[hi].z };
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  const i = lo;
  const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return { x: path[i - 1].x + (path[i].x - path[i - 1].x) * f, z: path[i - 1].z + (path[i].z - path[i - 1].z) * f };
}

function minOrNull(a, b) {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.min(a, b);
}

// Pontos a 1/3 e 2/3 do comprimento do traçado, com a direção da pista nesse ponto.
function computeSectors(path) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  }
  const total = cum[cum.length - 1];
  return [1 / 3, 2 / 3].map((frac) => {
    const target = total * frac;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < target) i++;
    const a = path[i - 1];
    const b = path[i];
    const f = (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    // Direção média de alguns pontos à volta, para não depender de um segmento torto.
    const p0 = path[Math.max(0, i - 3)];
    const p1 = path[Math.min(path.length - 1, i + 2)];
    const len = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1;
    return {
      x: round1(a.x + (b.x - a.x) * f),
      z: round1(a.z + (b.z - a.z) * f),
      dir: { x: (p1.x - p0.x) / len, z: (p1.z - p0.z) / len },
    };
  });
}

function downsample(samples) {
  const out = [];
  let lastDist = -Infinity;
  for (const [dist, ...rest] of samples) {
    if (dist - lastDist >= SAMPLE_STEP_M) {
      out.push([round1(dist), ...rest]);
      lastDist = dist;
    }
  }
  const lastSample = samples[samples.length - 1];
  if (out[out.length - 1][1] !== lastSample[1]) out.push([round1(lastSample[0]), ...lastSample.slice(1)]);
  return out;
}
