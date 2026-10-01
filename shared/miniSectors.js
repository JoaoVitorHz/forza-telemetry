// Mini-setores: a volta é dividida em n troços de igual distância e cada troço é comparado
// com o mesmo troço do recorde. "purple" = mais rápido que o recorde, "yellow" = mais lento,
// null = ainda não percorrido. Amostras: [distância m, tempo ms, ...].

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

// complete = volta terminada: os troços são proporcionais ao comprimento da própria volta
// (traçados diferentes têm comprimentos ligeiramente diferentes).
export function miniSectorColors(samples, ref, n, complete) {
  if (!samples?.length || !ref?.length || n < 2) return null;
  const refLen = ref[ref.length - 1][0];
  const lapLen = complete ? samples[samples.length - 1][0] : refLen;
  const reached = samples[samples.length - 1][0];
  const colors = [];
  for (let k = 1; k <= n; k++) {
    const lapEnd = (k * lapLen) / n;
    if (!complete && lapEnd > reached) {
      colors.push(null);
      continue;
    }
    const lapStart = ((k - 1) * lapLen) / n;
    const refStart = ((k - 1) * refLen) / n;
    const refEnd = (k * refLen) / n;
    const lapMs = timeAt(samples, lapEnd) - timeAt(samples, lapStart);
    const refMs = timeAt(ref, refEnd) - timeAt(ref, refStart);
    colors.push(lapMs < refMs ? "purple" : "yellow");
  }
  return colors;
}
