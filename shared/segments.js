// Trechos (mini-setores fixos na pista): as 24 linhas da volta ideal dividem a volta em 25 trechos
// iguais. Cada volta — completa ou tentativa parcial — guarda o instante em que passou em cada linha
// (gateTimes), por isso o trecho k é sempre o mesmo pedaço de pista.

export const SEGMENT_COUNT = 25;

// Tempo (ms) de cada trecho de uma volta; null nos trechos que não fez.
export function segmentTimes(lap) {
  const gates = lap?.gateTimes;
  if (!gates?.length) return null;
  const finished = !lap.partial && !lap.invalid && gates.length === SEGMENT_COUNT - 1;
  const bounds = [0, ...gates, ...(finished ? [lap.ms] : [])];
  return Array.from({ length: SEGMENT_COUNT }, (_, k) => (bounds[k + 1] != null ? bounds[k + 1] - bounds[k] : null));
}

// Cores dos trechos de uma volta, comparando com as outras voltas do mesmo carro:
// "purple" = melhor trecho de todas as voltas, "green" = mais rápido que o recorde nesse trecho,
// "yellow" = mais lento que o recorde, null = não fez o trecho.
export function segmentColors(lap, laps) {
  const mine = segmentTimes(lap);
  if (!mine) return null;
  const valid = laps.filter((l) => !l.invalid);
  const all = valid.map(segmentTimes).filter(Boolean);
  const best = mine.map((_, k) => Math.min(...all.map((t) => t[k] ?? Infinity)));
  const record = valid.filter((l) => !l.partial).sort((a, b) => a.ms - b.ms)[0];
  const rec = segmentTimes(record);
  const colors = mine.map((ms, k) => {
    if (ms == null) return null;
    if (ms <= best[k]) return "purple";
    if (rec?.[k] != null && ms < rec[k]) return "green";
    return "yellow";
  });
  return { colors, mine, best, rec };
}
