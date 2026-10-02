// Volta ideal: junta o troço mais rápido de cada uma das voltas num referencial só.
// Os troços são delimitados por linhas fixas na pista (como os setores): cada volta guarda o
// instante em que passou em cada linha (gateTimes). Assim o troço k é o mesmo pedaço de pista
// em todas as voltas, mesmo que tenham distâncias diferentes (linha mais aberta, marcha-atrás…).
// Amostras: [distância m, tempo ms, ...].

const STEPS_PER_SEGMENT = 12; // pontos por troço nas amostras da volta ideal

function lookup(samples, value, col, outCol) {
  let lo = 0;
  let hi = samples.length - 1;
  if (value <= samples[0][col]) return samples[0][outCol];
  if (value >= samples[hi][col]) return samples[hi][outCol];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid][col] <= value) lo = mid;
    else hi = mid;
  }
  const v0 = samples[lo][col];
  const v1 = samples[hi][col];
  const f = v1 === v0 ? 0 : (value - v0) / (v1 - v0);
  return samples[lo][outCol] + f * (samples[hi][outCol] - samples[lo][outCol]);
}
const distAtTime = (samples, ms) => lookup(samples, ms, 1, 0);
const timeAtDist = (samples, d) => lookup(samples, d, 0, 1);

// laps: [{ ms, samples, gateTimes }], gateFracs: posição de cada linha em fração da volta.
// Só contam voltas que passaram em todas as linhas. Devolve { ms, samples } ou null.
export function buildIdeal(laps, gateFracs) {
  if (!gateFracs?.length) return null;
  const pool = laps
    .filter((l) => l?.samples?.length > 2 && l.gateTimes?.length === gateFracs.length && l.ms > 0)
    .map((l) => ({ ...l, bounds: [0, ...l.gateTimes, l.ms] }));
  if (!pool.length) return null;

  // Comprimento típico (mediana) para pôr as distâncias da volta ideal na mesma escala do delta.
  const lengths = pool.map((l) => l.samples[l.samples.length - 1][0]).sort((a, b) => a - b);
  const length = lengths[Math.floor(lengths.length / 2)];
  const fracs = [0, ...gateFracs, 1];

  const samples = [[0, 0]];
  let total = 0;
  for (let k = 0; k < fracs.length - 1; k++) {
    let best = pool[0];
    for (const l of pool) {
      if (l.bounds[k + 1] - l.bounds[k] < best.bounds[k + 1] - best.bounds[k]) best = l;
    }
    const [t0, t1] = [best.bounds[k], best.bounds[k + 1]];
    const [d0, d1] = [distAtTime(best.samples, t0), distAtTime(best.samples, t1)];
    const [D0, D1] = [fracs[k] * length, fracs[k + 1] * length];
    // Passa o troço da volta escolhida para a escala da volta ideal (distância proporcional).
    for (let u = 1; u <= STEPS_PER_SEGMENT; u++) {
      const d = d0 + ((d1 - d0) * u) / STEPS_PER_SEGMENT;
      const t = timeAtDist(best.samples, d);
      samples.push([Math.round((D0 + ((D1 - D0) * u) / STEPS_PER_SEGMENT) * 10) / 10, Math.round(total + t - t0)]);
    }
    total += t1 - t0;
  }
  samples[samples.length - 1][1] = Math.round(total);
  return { ms: Math.round(total), samples };
}
