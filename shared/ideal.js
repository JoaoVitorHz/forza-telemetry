// Volta ideal: junta o troço mais rápido de cada uma das voltas num referencial só.
// Amostras: [distância m, tempo ms, ...]. Cada volta é dividida em `segments` troços
// proporcionais ao seu comprimento (traçados diferentes têm comprimentos diferentes).

const SEGMENTS = 40;
const STEPS_PER_SEGMENT = 8; // pontos por troço nas amostras da volta ideal
const MAX_LENGTH_DIFF = 0.05; // voltas 5% mais curtas/longas que o normal (atalhos, saídas) ficam de fora

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

// Devolve { ms, samples } ou null se não houver voltas suficientes.
export function buildIdeal(laps, segments = SEGMENTS) {
  const valid = laps.filter((s) => s?.length > 2);
  if (!valid.length) return null;
  const lengths = valid.map((s) => s[s.length - 1][0]).sort((a, b) => a - b);
  const base = lengths[Math.floor(lengths.length / 2)]; // comprimento típico (mediana)
  const pool = valid.filter((s) => Math.abs(s[s.length - 1][0] - base) / base <= MAX_LENGTH_DIFF);
  if (!pool.length) return null;

  const samples = [[0, 0]];
  let total = 0;
  for (let k = 0; k < segments; k++) {
    // Volta mais rápida neste troço.
    let best = null;
    let bestMs = Infinity;
    for (const s of pool) {
      const len = s[s.length - 1][0];
      const ms = timeAt(s, ((k + 1) * len) / segments) - timeAt(s, (k * len) / segments);
      if (ms < bestMs) {
        bestMs = ms;
        best = s;
      }
    }
    const len = best[best.length - 1][0];
    const t0 = timeAt(best, (k * len) / segments);
    for (let u = 1; u <= STEPS_PER_SEGMENT; u++) {
      const f = (k + u / STEPS_PER_SEGMENT) / segments;
      samples.push([Math.round(f * base * 10) / 10, Math.round(total + timeAt(best, f * len) - t0)]);
    }
    total += bestMs;
  }
  return { ms: Math.round(total), samples };
}
