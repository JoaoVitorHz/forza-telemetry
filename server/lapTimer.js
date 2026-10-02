import { miniSectorColors } from "../shared/miniSectors.js";
import { analyzeLap, detectCorners, topLosses } from "../shared/analysis.js";
import { buildIdeal } from "../shared/ideal.js";

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
const IDEAL_GATES = 24; // linhas fixas que dividem a volta em troços para a volta ideal
const SCOUT_STEP_M = 2; // resolução do trajeto guardado à procura de um circuito
const SCOUT_MAX_POINTS = 20_000; // ~40 km de trajeto
const LOOP_MATCH_M = 10; // distância para considerar que voltou a passar no mesmo ponto
const ABANDON_FACTOR = 3; // volta automática com mais do triplo da primeira = saiu do circuito
const RACE_END_MS = 3000; // tempo de volta do jogo a 0 durante isto = a corrida acabou
const REWIND_MATCH_M = 8; // depois de retroceder o carro reaparece num ponto já percorrido (a menos disto)
const REWIND_MIN_BACK_M = 5; // recuos menores contam como pausa (o carro ficou no mesmo sítio)

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
    this.raceZeroSince = null; // quando o tempo de volta do jogo ficou a 0 (fim de corrida?)
    this.manualPause = false; // botão Pausar: ignora os pacotes até retomar
    this.carKey = null; // ID do carro atual (recordes e setores são por carro)
    this.miniCount = 0; // n.º de mini-setores (0 = desligado), vem das Configurações
    this.autoStart = true; // deteta a partida sozinho ao fechar um circuito (Configurações)
    this.autoMinLength = 800; // comprimento mínimo do circuito (m)
    this.deltaMode = "best"; // referência do delta e do fantasma: "best" (recorde) ou "ideal"
    this.historyLaps = null; // (idPista, carro) => voltas guardadas { ms, samples, gateTimes } (dado pelo servidor)
    this.onTrackUpdate = null; // chamado quando recorde, setores ou melhores setores mudam
    this.onLapComplete = null; // chamado com cada volta fechada (com traçado), para o histórico
    this.reset();
  }

  reset() {
    this.track = null; // { id, name } se a pista estiver guardada
    this.autoDetected = false; // partida encontrada sozinha (pista ainda não guardada)
    this.scout = []; // trajeto à procura de um circuito: { x, z, dir, dist, sample }
    this.scoutDist = 0;
    this.scoutMs = 0;
    this.start = null; // { x, z, dir: { x, z } | null }
    this.sectors = null; // divisões S1/S2: [{ x, z, dir }, { x, z, dir }]
    this.corners = null; // curvas da pista: [{ frac, x, z }] (frac = posição em fração da volta)
    this.idealGates = null; // linhas da volta ideal (calculadas do traçado da pista, sempre iguais)
    this.lastAnalysis = null; // { n, items } — onde se perdeu tempo na última volta
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
    this.rebuildIdeal();
  }

  // Volta ideal do carro atual: melhores troços das voltas guardadas desta pista e da sessão.
  rebuildIdeal() {
    this.ensureIdealGates();
    if (!this.idealGates) {
      this.ideal = null;
      return;
    }
    const pool = [];
    if (this.track && this.historyLaps) pool.push(...this.historyLaps(this.track.id, this.carKey));
    for (const lap of this.laps ?? []) {
      const detail = lap.car === this.carKey && this.lapPaths?.get(lap.n);
      if (detail) pool.push({ ms: lap.ms, samples: detail.samples, gateTimes: detail.gateTimes });
    }
    this.ideal = buildIdeal(pool, this.idealGates.map((g) => g.frac));
  }

  // Linhas da volta ideal, a intervalos iguais ao longo do traçado fixo da pista.
  ensureIdealGates() {
    const path = this.trackPath ?? this.ref?.path;
    if (this.idealGates || !path || path.length < 10) return;
    const fracs = Array.from({ length: IDEAL_GATES }, (_, k) => (k + 1) / (IDEAL_GATES + 1));
    this.idealGates = computeGates(path, fracs);
  }

  // Amostras de referência do delta e do fantasma, conforme a opção escolhida.
  deltaRefSamples() {
    return this.deltaMode === "ideal" && this.ideal ? this.ideal.samples : this.ref?.samples;
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

  // Sem partida: guarda o trajeto e procura um ponto por onde o carro já passou, no mesmo
  // sentido, há pelo menos autoMinLength metros. Isso fecha um circuito: esse ponto passa
  // a ser a partida e o percurso desde lá conta como primeira volta.
  scoutStep(t, prev, dt, step) {
    this.scoutMs += dt;
    this.scoutDist += step;
    const last = this.scout[this.scout.length - 1];
    if (last && this.scoutDist - last.dist < SCOUT_STEP_M) return;
    const dir = step > 0.05 ? { x: (t.x - prev.x) / step, z: (t.z - prev.z) / step } : null;
    const point = {
      x: t.x,
      z: t.z,
      dir,
      dist: this.scoutDist,
      sample: [this.scoutDist, this.scoutMs, Math.round(t.speed * 3.6), Math.round(t.throttle / 2.55), Math.round(t.brake / 2.55)],
    };

    if (dir) {
      const limit = this.scoutDist - this.autoMinLength;
      for (let i = 0; i < this.scout.length && this.scout[i].dist <= limit; i++) {
        const p = this.scout[i];
        if (!p.dir || Math.hypot(t.x - p.x, t.z - p.z) > LOOP_MATCH_M) continue;
        if (p.dir.x * dir.x + p.dir.z * dir.z < 0.8) continue; // mesmo ponto, outro sentido (cruzamento)
        this.startFromLoop(i, t);
        return;
      }
    }
    this.scout.push(point);
    if (this.scout.length > SCOUT_MAX_POINTS) this.scout.shift();
  }

  startFromLoop(i, t) {
    const from = this.scout[i];
    const loop = this.scout.slice(i);
    this.start = { x: from.x, z: from.z, dir: from.dir };
    this.autoDetected = true;
    this.lapNumber = 0;
    this.beginLap();
    // O percurso desde a partida encontrada é a primeira volta (distância e tempo a partir de lá).
    this.samples = loop.map((p) => [p.dist - from.dist, p.sample[1] - from.sample[1], ...p.sample.slice(2)]);
    this.samplePos = loop.map((p) => ({ x: p.x, z: p.z }));
    this.path = loop.map((p) => ({ x: p.x, z: p.z }));
    this.pathDist = loop.map((p) => p.dist - from.dist);
    this.lapDist = this.scoutDist - from.dist;
    this.currentMs = this.scoutMs - from.sample[1];
    this.scout = [];
    this.mapVersion++;
    console.log(`[volta] circuito detetado: ${Math.round(this.lapDist)} m, primeira volta ${(this.currentMs / 1000).toFixed(3)} s`);
    this.completeLap(this.currentMs, t);
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
    this.corners = track.corners ?? null;
    this.trackPath = track.path ?? null;
    this.records = structuredClone(track.records ?? {});
    this.applyCar();
    const sectorsAdded = this.ensureSectors();
    if (this.ensureCorners() || sectorsAdded) this.onTrackUpdate?.(this);
  }

  // Associa uma pista guardada a meio de uma corrida, sem perder as voltas já feitas.
  // Fica o melhor de cada lado (guardado ou desta corrida) e o resultado é gravado.
  attachTrack(track) {
    this.track = { id: track.id, name: track.name };
    this.start = track.start;
    this.sectors = track.sectors ?? this.sectors;
    this.corners = track.corners ?? this.corners;
    this.trackPath = track.path ?? this.trackPath;
    const saved = track.records?.[this.carKey];
    if (saved?.best && (!this.ref || saved.best.ms <= this.ref.ms)) this.ref = saved.best;
    const savedSectors = saved?.bestSectors ?? emptySectors();
    this.bestSectors = this.bestSectors.map((ms, i) => minOrNull(ms, savedSectors[i]));
    this.records = { ...structuredClone(track.records ?? {}) };
    this.commitRecord();
    this.ensureSectors();
    this.ensureCorners();
    this.rebuildIdeal();
    this.mapVersion++;
    this.onTrackUpdate?.(this);
  }

  beginLap(pos = this.start) {
    this.running = true;
    this.lapNumber++;
    this.currentMs = 0;
    this.lapDist = 0;
    // 1.ª amostra já com velocidade e pedais (do último pacote), como as restantes.
    const p = this.prev;
    this.samples = [[0, 0, Math.round((p?.speed ?? 0) * 3.6), Math.round((p?.throttle ?? 0) / 2.55), Math.round((p?.brake ?? 0) / 2.55)]];
    this.partial = false; // volta apanhada a meio (sem origem de distância fiável)
    this.samplePos = [{ x: pos.x, z: pos.z }]; // posição de cada amostra (para desfazer um retroceder)
    this.path = [{ x: pos.x, z: pos.z }];
    this.pathDist = [0];
    this.armed = false;
    this.prevStartDist = 0;
    this.splits = [];
    this.splitIdx = []; // índice no traçado onde cada setor fechou (para colorir o mapa)
    this.nextGate = 0;
    this.gatePrevSide = null;
    this.splitAtMs = 0;
    this.splitMarks = []; // { dist, atMs } de cada setor fechado nesta volta
    this.ensureIdealGates();
    this.gateTimes = []; // instante de passagem em cada linha da volta ideal
    this.gateDists = [];
    this.idealGatePrevSide = null;
  }

  update(t) {
    const prev = this.prev;
    this.prev = t;
    this.paused = !t.isRaceOn;
    if (!t.isRaceOn || this.manualPause) return;
    this.setCar(String(t.carOrdinal));

    // Corrida oficial: o jogo envia o tempo da volta; fora dela vem a zero. (O "tempo de corrida"
    // não serve: no FH6 conta sempre, mesmo em roaming livre.) Ao passar a meta o tempo de volta
    // também vai a 0 por instantes, por isso só se sai da corrida se ficar a 0 algum tempo.
    if (t.currentLap > 0) {
      this.raceZeroSince = null;
      if (!this.gameRace) this.enterRace(t);
    } else if (this.gameRace) {
      this.raceZeroSince ??= t.timestampMs;
      if (t.timestampMs - this.raceZeroSince > RACE_END_MS) this.leaveRace();
    }

    // Em pausa congela; ao retomar, o primeiro pacote só serve de referência (ressincroniza).
    // Pausa e retroceder chegam ambos como pacotes "fora de corrida"; se o carro reaparecer
    // atrás, num ponto já percorrido, foi um retroceder e a volta recua até esse ponto.
    if (!prev || !prev.isRaceOn) {
      if (prev && this.running) this.undoRewind(t);
      return;
    }
    const dt = t.timestampMs - prev.timestampMs;
    const step = Math.hypot(t.x - prev.x, t.z - prev.z);
    const validStep = dt > 0 && dt <= MAX_DT_MS && step <= MAX_STEP_M;

    if (this.gameRace) {
      this.updateRace(t, prev, validStep ? step : 0);
      return;
    }
    if (!validStep) {
      if (step > MAX_STEP_M) this.scout = []; // teleporte: o trajeto anterior já não serve
      return;
    }
    if (!this.start) {
      if (this.autoStart) this.scoutStep(t, prev, dt, step);
      return;
    }

    // Partida manual com o carro parado: o sentido da pista é o do primeiro movimento.
    if (!this.start.dir && step > 0.1) {
      this.start.dir = { x: (t.x - prev.x) / step, z: (t.z - prev.z) / step };
    }

    const d = Math.hypot(t.x - this.start.x, t.z - this.start.z);
    // Passagem na partida: a partida é uma linha perpendicular ao sentido da pista e o instante
    // exato é interpolado entre os dois pacotes (crossF = fração de dt até à linha). Sem sentido
    // conhecido, vale o pacote mais próximo do ponto de partida.
    let crossF = null;
    if (this.start.dir) {
      const side = (t.x - this.start.x) * this.start.dir.x + (t.z - this.start.z) * this.start.dir.z;
      const prevSide = this.startPrevSide;
      if (d < START_RADIUS && prevSide != null && prevSide < 0 && side >= 0) crossF = prevSide / (prevSide - side);
      this.startPrevSide = d < START_RADIUS * 2 ? side : null;
    } else if (d < START_RADIUS && d > this.prevStartDist && headingOk(this.start, prev, t)) {
      crossF = 1;
    }
    this.prevStartDist = d;

    if (!this.running) {
      if (crossF != null) {
        this.beginLap();
        this.currentMs = Math.round((1 - crossF) * dt);
      }
      return;
    }

    const prevMs = this.currentMs;
    this.currentMs += dt;
    this.advance(t, step, prevMs);

    // Partida automática não guardada e volta muito mais longa que a primeira: o carro saiu
    // do circuito. Descarta-a e volta a procurar.
    if (this.autoDetected && !this.track && this.ref && this.currentMs > this.ref.ms * ABANDON_FACTOR) {
      console.log("[volta] saiu do circuito detetado; a procurar outro");
      this.reset();
      return;
    }

    if (!this.armed && d > ARM_DISTANCE) this.armed = true;
    if (this.armed && crossF != null && this.currentMs > MIN_LAP_MS) {
      const lapMs = Math.round(prevMs + crossF * dt);
      const carry = this.currentMs - lapMs; // o resto do intervalo já pertence à volta seguinte
      this.completeLap(lapMs);
      this.currentMs = carry;
    }
  }

  enterRace(t) {
    this.gameRace = true;
    this.gameLap = t.lapNumber;
    this.resetLaps();
    this.beginLap(t);
    // Apanhou a corrida a meio de uma volta (ex.: programa reiniciado): o tempo vem do jogo, mas a
    // distância não começou na meta, por isso esta volta não tem delta nem é gravada.
    if (t.currentLap > 2) this.partial = true;
  }

  leaveRace() {
    this.gameRace = false;
    this.running = false; // volta à deteção pela partida (se houver uma)
    this.prevStartDist = Infinity;
    this.startPrevSide = null;
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
    this.samplePos.push({ x: t.x, z: t.z });
    // [distância, tempo, km/h, acelerador %, travão %] — delta e gráfico de comparação
    this.samples.push([
      this.lapDist,
      this.currentMs,
      Math.round(t.speed * 3.6),
      Math.round(t.throttle / 2.55),
      Math.round(t.brake / 2.55),
    ]);
    const last = this.path[this.path.length - 1];
    if (Math.hypot(t.x - last.x, t.z - last.z) >= PATH_STEP_M) {
      this.path.push({ x: t.x, z: t.z });
      this.pathDist.push(this.lapDist);
    }
    this.checkGate(t, prevMs);
    this.checkIdealGate(t, prevMs);
  }

  // Passagem nas linhas da volta ideal (uma de cada vez, por ordem), com o instante interpolado.
  checkIdealGate(t, prevMs) {
    const i = this.gateTimes.length;
    if (!this.idealGates || i >= this.idealGates.length) return;
    const g = this.idealGates[i];
    const side = (t.x - g.x) * g.dir.x + (t.z - g.z) * g.dir.z;
    const near = Math.hypot(t.x - g.x, t.z - g.z) < GATE_RADIUS;
    if (near && this.idealGatePrevSide != null && this.idealGatePrevSide < 0 && side >= 0) {
      const f = this.idealGatePrevSide / (this.idealGatePrevSide - side);
      this.gateTimes.push(Math.round(prevMs + f * (this.currentMs - prevMs)));
      this.gateDists.push(this.lapDist);
      this.idealGatePrevSide = null;
      return;
    }
    this.idealGatePrevSide = near ? side : null;
  }

  // Retroceder: volta ao estado da volta no ponto onde o carro reapareceu (tempo, distância,
  // traçado e setores), como o próprio jogo faz. Nas corridas o tempo vem do jogo.
  undoRewind(t) {
    let best = -1;
    let bestD = REWIND_MATCH_M;
    for (let i = 0; i < this.samplePos.length; i++) {
      const p = this.samplePos[i];
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return; // reapareceu noutro sítio: não é um retroceder dentro desta volta
    const [dist, ms] = this.samples[best];
    if (this.lapDist - dist < REWIND_MIN_BACK_M) return; // pausa: ficou onde estava

    this.samples.length = best + 1;
    this.samplePos.length = best + 1;
    this.lapDist = dist;
    if (!this.gameRace) this.currentMs = ms;
    while (this.pathDist.length > 1 && this.pathDist[this.pathDist.length - 1] > dist) {
      this.pathDist.pop();
      this.path.pop();
    }
    while (this.splitMarks.length && this.splitMarks[this.splitMarks.length - 1].dist > dist) {
      this.splitMarks.pop();
      this.nextGate--;
      this.splits.length = this.nextGate;
      this.splitIdx.length = this.nextGate;
    }
    this.splitAtMs = this.splitMarks[this.splitMarks.length - 1]?.atMs ?? 0;
    this.gatePrevSide = null;
    while (this.gateDists.length && this.gateDists[this.gateDists.length - 1] > dist) {
      this.gateDists.pop();
      this.gateTimes.pop();
    }
    this.idealGatePrevSide = null;
    this.prevStartDist = Infinity; // não confundir o reaparecimento com uma passagem na partida
    this.startPrevSide = null;
    console.log(`[volta] retroceder: volta reposta em ${Math.round(dist)} m / ${(ms / 1000).toFixed(3)} s`);
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
      this.splitMarks.push({ dist: this.lapDist, atMs: at });
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
    if (this.partial) {
      console.log("[volta] volta apanhada a meio: não foi gravada");
      this.beginLap(pos);
      return;
    }
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
    const complete = this.idealGates && this.gateTimes.length === this.idealGates.length;
    this.lapPaths.set(this.lapNumber, {
      path: lapPath,
      splitIdx: this.splitIdx,
      samples: lapSamples,
      gateTimes: complete ? [...this.gateTimes] : null, // só voltas que passaram em todas as linhas
    });
    if (this.laps.length > MAX_LAP_HISTORY) this.lapPaths.delete(this.laps.shift().n);

    // Onde se perdeu tempo, em relação à referência antes desta volta.
    const analysis = this.corners && this.ref ? analyzeLap(lapSamples, this.ref.samples, this.corners) : null;
    this.lastAnalysis = analysis ? { n: this.lapNumber, items: topLosses(analysis) } : null;

    this.lastLapMs = lap;
    if (this.sessionBestMs == null || lap < this.sessionBestMs) this.sessionBestMs = lap;
    if (!this.ref || lap < this.ref.ms) {
      this.ref = { ms: lap, samples: lapSamples, path: lapPath };
      this.mapVersion++;
      changed = true;
    }
    if (this.ensureSectors()) changed = true;
    if (this.ensureCorners()) changed = true;
    if (changed) {
      this.commitRecord();
      this.onTrackUpdate?.(this);
    }
    this.rebuildIdeal();
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

  // Deteta as curvas na referência (precisa de velocidade nas amostras). Ficam fixas na pista
  // para a numeração não mudar.
  ensureCorners() {
    if (this.corners || !this.ref?.samples || !this.ref.path?.length) return false;
    const found = detectCorners(this.ref.samples);
    if (!found.length) return false;
    this.corners = found.map((c) => ({ frac: Math.round(c.frac * 10000) / 10000, ...pointAtFraction(this.ref, c.frac) }));
    this.mapVersion++;
    console.log(`[pista] ${found.length} curvas detetadas`);
    return true;
  }

  // Delta = tempo atual − tempo da referência (recorde ou volta ideal) à mesma distância percorrida.
  deltaMs() {
    const best = this.deltaRefSamples();
    if (!this.running || this.partial || !best || best.length < 2 || this.lapDist > best[best.length - 1][0]) return null;
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

  // Fantasma: onde estaria o carro da referência (recorde ou volta ideal) com o mesmo tempo de volta.
  // A posição é tirada do traçado do recorde.
  ghost() {
    const ref = this.ref;
    const samples = this.deltaRefSamples();
    if (!this.running || this.partial || !samples?.length || !ref?.path?.length) return null;
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
      autoDetected: this.autoDetected,
      scouting: !this.start && !this.gameRace && this.autoStart,
      lapNumber: this.lapNumber,
      currentMs: this.currentMs,
      deltaMs: this.deltaMs(),
      ghost: this.ghost(),
      partialLap: this.partial,
      miniSectors:
        this.running && !this.partial && this.miniCount ? miniSectorColors(this.samples, this.ref?.samples, this.miniCount, false) : null,
      lastLapMs: this.lastLapMs,
      sessionBestMs: this.sessionBestMs,
      recordMs: this.ref?.ms ?? null,
      idealMs: this.ideal?.ms ?? null,
      deltaMode: this.deltaMode === "ideal" && this.ideal ? "ideal" : "best",
      laps: this.laps,
      manualPause: this.manualPause,
      lastAnalysis: this.lastAnalysis,
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
    return {
      start: this.start,
      refPath: this.ref?.path ?? this.trackPath,
      sectors: this.sectors,
      corners: this.corners,
      mapVersion: this.mapVersion,
    };
  }
}

// Comprimentos acumulados do traçado do recorde (em cache).
const cumCache = new WeakMap();
function cumulative(ref) {
  let cum = cumCache.get(ref);
  if (!cum) {
    const path = ref.path;
    cum = [0];
    for (let i = 1; i < path.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
    }
    cumCache.set(ref, cum);
  }
  return cum;
}

function pointAtFraction(ref, frac) {
  const cum = cumulative(ref);
  const p = pointAtDistance(ref, frac * cum[cum.length - 1]);
  return { x: round1(p.x), z: round1(p.z) };
}

// Ponto do traçado do recorde à distância d.
function pointAtDistance(ref, d) {
  const path = ref.path;
  const cum = cumulative(ref);
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
  return computeGates(path, [1 / 3, 2 / 3]).map(({ frac, ...gate }) => gate);
}

// Linhas perpendiculares ao traçado nas frações pedidas do seu comprimento.
function computeGates(path, fracs) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  }
  const total = cum[cum.length - 1];
  return fracs.map((frac) => {
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
      frac,
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
