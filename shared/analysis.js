// Análise de voltas: deteção de curvas e "onde perdeste tempo".
// Amostras: [distância m, tempo ms, km/h, acelerador %, travão %, patinagem ×100 (voltas novas)]. Voltas diferentes têm
// comprimentos ligeiramente diferentes, por isso as posições comparam-se em fração da volta.

const CORNER_DROP_KMH = 12; // quebra mínima de velocidade (desde o pico anterior) para ser curva
const CORNER_RISE_KMH = 8; // recuperação depois do mínimo que confirma a curva
const BRAKE_ON = 20; // % de travão a partir do qual conta como travagem
const FULL_THROTTLE = 95; // % de acelerador que conta como "a fundo"
const APEX_WINDOW_M = 80; // procura da velocidade mínima à volta do vértice
const MIN_LOSS_MS = 50;
const SPIN_THROTTLE = 30; // % de acelerador a partir do qual a patinagem conta como destracionar

// Metros a destracionar entre duas distâncias (null se a volta não tem a coluna de patinagem).
export function spinMeters(samples, from, to, threshold) {
  if (!samples?.[1] || samples[1].length < 6) return null;
  let meters = 0;
  for (let i = 1; i < samples.length; i++) {
    const [dist, , , thr, , spin] = samples[i];
    if (dist <= from || dist > to) continue;
    if (spin > threshold && thr >= SPIN_THROTTLE) meters += dist - samples[i - 1][0];
  }
  return Math.round(meters);
}

// Trechos a destracionar, em fração da volta: [[início, fim], …] (para marcar no mapa).
export function spinRanges(samples, threshold) {
  if (!samples?.[1] || samples[1].length < 6) return [];
  const len = samples[samples.length - 1][0];
  const ranges = [];
  let open = null;
  for (const [dist, , , thr, , spin] of samples) {
    const on = spin > threshold && thr >= SPIN_THROTTLE;
    if (on && open == null) open = dist;
    if (!on && open != null) {
      ranges.push([open / len, dist / len]);
      open = null;
    }
  }
  if (open != null) ranges.push([open / len, 1]);
  return ranges;
}

// A 1.ª amostra das voltas gravadas até agora só tinha [distância, tempo]; a velocidade e os
// pedais começam na 2.ª. Copia-os da 2.ª para a 1.ª para todas terem as 5 colunas.
export function withTraces(samples) {
  if (!samples || samples.length < 2 || samples[0].length >= samples[1].length) return samples;
  return [[samples[0][0], samples[0][1], ...samples[1].slice(2)], ...samples.slice(1)];
}

const hasTraces = (samples) => samples?.length > 2 && samples[1].length >= 5;
const lengthOf = (samples) => samples[samples.length - 1][0];

function timeAt(samples, d) {
  let lo = 0;
  let hi = samples.length - 1;
  if (d <= samples[0][0]) return samples[0][1];
  if (d >= samples[hi][0]) return samples[hi][1];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid][0] <= d) lo = mid;
    else hi = mid;
  }
  const [d0, t0] = samples[lo];
  const [d1, t1] = samples[hi];
  return d1 === d0 ? t0 : t0 + ((d - d0) / (d1 - d0)) * (t1 - t0);
}

// Curvas = mínimos de velocidade com quebra e recuperação suficientes (histerese).
// Devolve a posição de cada vértice em fração da volta.
export function detectCorners(raw) {
  const samples = withTraces(raw);
  if (!hasTraces(samples)) return [];
  const total = lengthOf(samples);
  const corners = [];
  let peak = samples[0][2];
  let min = Infinity;
  let minDist = 0;
  let seekingMin = false;
  for (const [dist, , kmh] of samples) {
    if (!seekingMin) {
      if (kmh > peak) peak = kmh;
      else if (peak - kmh >= CORNER_DROP_KMH) {
        seekingMin = true;
        min = kmh;
        minDist = dist;
      }
    } else if (kmh < min) {
      min = kmh;
      minDist = dist;
    } else if (kmh - min >= CORNER_RISE_KMH) {
      corners.push({ frac: minDist / total });
      seekingMin = false;
      peak = kmh;
    }
  }
  return corners;
}

// Mede uma curva numa volta: ponto de travagem, velocidade mínima e ponto de acelerar a fundo,
// em metros relativos ao vértice (negativo = antes do vértice).
function measureCorner(samples, apex, zoneStart, zoneEnd, spinThreshold) {
  let brake = null;
  let minKmh = Infinity;
  let minDist = apex;
  let minIdx = -1;
  for (let i = 0; i < samples.length; i++) {
    const [dist, , kmh, , brk] = samples[i];
    if (dist < zoneStart || dist > zoneEnd) continue;
    if (brake == null && dist <= apex && brk >= BRAKE_ON) brake = dist;
    if (Math.abs(dist - apex) <= APEX_WINDOW_M && kmh < minKmh) {
      minKmh = kmh;
      minDist = dist;
      minIdx = i;
    }
  }
  let throttle = null;
  for (let i = Math.max(minIdx, 0); i < samples.length && samples[i][0] <= zoneEnd; i++) {
    if (samples[i][3] >= FULL_THROTTLE) {
      throttle = samples[i][0];
      break;
    }
  }
  return {
    brakeRel: brake == null ? null : Math.round(brake - minDist),
    minKmh: Number.isFinite(minKmh) ? minKmh : null,
    throttleRel: throttle == null ? null : Math.round(throttle - minDist),
    apexDist: minDist,
    brakeDist: brake,
    throttleDist: throttle,
    spinM: spinMeters(samples, minDist, zoneEnd, spinThreshold), // a destracionar na saída
  };
}

// Causa mais provável da perda de tempo numa curva.
function mainCause(c) {
  const options = [];
  if (c.brakeDiffM != null && c.brakeDiffM <= -8) options.push({ type: "brakeEarly", score: -c.brakeDiffM / 8 });
  if (c.brakeDiffM != null && c.brakeDiffM >= 8) options.push({ type: "brakeLate", score: c.brakeDiffM / 8 });
  if (c.minSpeedDiff != null && c.minSpeedDiff <= -4) options.push({ type: "slowApex", score: -c.minSpeedDiff / 4 });
  if (c.throttleDiffM != null && c.throttleDiffM >= 10) options.push({ type: "throttleLate", score: c.throttleDiffM / 10 });
  if (c.spinDiffM != null && c.spinDiffM >= 10) options.push({ type: "wheelspin", score: c.spinDiffM / 8 });
  options.sort((a, b) => b.score - a.score);
  return options[0]?.type ?? "line";
}

// Compara uma volta com a referência curva a curva. Cada curva tem a sua zona (até meio
// caminho das curvas vizinhas) e o tempo perdido nessa zona.
// spinThreshold: patinagem (×100) que conta como destracionar.
export function analyzeLap(rawLap, rawRef, corners, spinThreshold = 30) {
  const lap = withTraces(rawLap);
  const ref = withTraces(rawRef);
  if (!hasTraces(lap) || !hasTraces(ref) || !corners?.length) return null;
  const lapLen = lengthOf(lap);
  const refLen = lengthOf(ref);
  return corners.map((corner, k) => {
    const zoneFrom = k === 0 ? 0 : (corners[k - 1].frac + corner.frac) / 2;
    const zoneTo = k === corners.length - 1 ? 1 : (corner.frac + corners[k + 1].frac) / 2;
    const zoneMs = (s, len) => timeAt(s, zoneTo * len) - timeAt(s, zoneFrom * len);
    const mine = measureCorner(lap, corner.frac * lapLen, zoneFrom * lapLen, zoneTo * lapLen, spinThreshold);
    const theirs = measureCorner(ref, corner.frac * refLen, zoneFrom * refLen, zoneTo * refLen, spinThreshold);
    const diff = (a, b) => (a == null || b == null ? null : Math.round(a - b));
    const result = {
      corner: k + 1,
      lostMs: Math.round(zoneMs(lap, lapLen) - zoneMs(ref, refLen)),
      brakeDiffM: diff(mine.brakeRel, theirs.brakeRel),
      minSpeedDiff: diff(mine.minKmh, theirs.minKmh),
      throttleDiffM: diff(mine.throttleRel, theirs.throttleRel),
      // Sem patinagem gravada na referência (voltas antigas), compara com 0.
      spinDiffM: mine.spinM == null ? null : mine.spinM - (theirs.spinM ?? 0),
      lap: { ...mine, len: lapLen },
      ref: { ...theirs, len: refLen },
    };
    result.cause = mainCause(result);
    return result;
  });
}

// As curvas onde se perdeu mais tempo (só perdas relevantes).
export function topLosses(analysis, count = 3) {
  return (analysis ?? [])
    .filter((c) => c.lostMs >= MIN_LOSS_MS)
    .sort((a, b) => b.lostMs - a.lostMs)
    .slice(0, count);
}

export function describeCause(c) {
  switch (c.cause) {
    case "brakeEarly":
      return `Travaste ${-c.brakeDiffM} m mais cedo`;
    case "brakeLate":
      return `Travaste ${c.brakeDiffM} m mais tarde (passaste do ponto?)`;
    case "slowApex":
      return `Velocidade mínima ${-c.minSpeedDiff} km/h abaixo`;
    case "wheelspin":
      return `Destracionou na saída da curva (${c.lap.spinM} m patinando)`;
    case "throttleLate":
      return `Aceleraste a fundo ${c.throttleDiffM} m mais tarde`;
    default:
      return "Linha ou tração diferente";
  }
}
