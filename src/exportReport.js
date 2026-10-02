import { analyzeLap, describeCause, spinRanges, withTraces } from "../shared/analysis.js";
import { fmtTime } from "./format.js";

// Relatório em texto para colar num chat (ou guardar em ficheiro) e pedir uma análise:
// resumo, tabela das voltas, curva a curva em todas as voltas e, opcionalmente, telemetria.

const sec = (ms) => (ms == null ? "--" : (ms / 1000).toFixed(3));
const signedSec = (ms) => (ms == null ? "--" : `${ms >= 0 ? "+" : ""}${(ms / 1000).toFixed(3)}`);
const pair = (a, b) => `${a ?? "--"}/${b ?? "--"}`;

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

// Amostra mais próxima de uma distância (para as colunas de telemetria).
function sampleAt(samples, d) {
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid][0] <= d) lo = mid;
    else hi = mid;
  }
  return Math.abs(samples[lo][0] - d) <= Math.abs(samples[hi][0] - d) ? samples[lo] : samples[hi];
}

const rangesInMeters = (ranges, len) =>
  ranges.map(([a, b]) => `${Math.round(a * len)}–${Math.round(b * len)} m`).join(", ") || "-";

export function buildReport(data, { carName, spinThreshold, stepM, includeTelemetry }) {
  const { trackName, ref, laps, corners, bestSectors, possibleBestMs, idealMs } = data;
  const refSamples = withTraces(ref?.samples);
  const refLen = refSamples?.length ? refSamples[refSamples.length - 1][0] : null;
  const out = [];
  const line = (s = "") => out.push(s);

  line("# Forza Telemetry — relatório para análise");
  line();
  line(`Pista: ${trackName}`);
  line(`Carro: ${carName}`);
  line(`Gerado em: ${new Date().toLocaleString("pt-BR")}`);
  line(`Voltas no relatório: ${laps.length}`);
  line();
  line("## Legenda");
  line("- Tempos em segundos. \"dif\" e \"delta\" = volta − referência (positivo = mais lento).");
  line("- Referência = recorde deste carro nesta pista.");
  line("- freio_m / afundo_m: distância do ponto de freada / de acelerador a fundo até ao vértice da curva");
  line("  (negativo = antes do vértice). Formato volta/referência.");
  line("- vmin: velocidade mínima na curva (km/h), volta/referência.");
  line(`- Destracionar = rodas de tração patinando acima de ${spinThreshold} (×100) com acelerador > 30%.`);
  line("- patina: patinagem das rodas de tração ×100 (≈10 acelerando normal, 40+ destracionando).");
  line();

  // Resumo
  const times = laps.map((l) => l.ms);
  const best = Math.min(...times);
  const mean = times.reduce((a, b) => a + b, 0) / (times.length || 1);
  line("## Resumo");
  line(`- Recorde (referência): ${fmtTime(ref?.ms)}`);
  line(`- Volta ideal: ${fmtTime(idealMs)}`);
  line(`- Possible best (soma dos melhores setores): ${fmtTime(possibleBestMs)}`);
  line(`- Melhores setores: ${(bestSectors ?? []).map(sec).join(" / ") || "--"}`);
  line(`- Melhor volta da seleção: ${fmtTime(best)} | média: ${fmtTime(Math.round(mean))}`);
  if (corners?.length && refLen) {
    line(`- Curvas detetadas (posição do vértice na referência): ${corners.map((c, i) => `C${i + 1} ${Math.round(c.frac * refLen)} m`).join(", ")}`);
  }
  line();

  // Voltas
  line("## Voltas");
  line("```");
  line("volta;data;tempo;dif_ref;S1;S2;S3;destracionou;trechos_destracionando");
  const analyses = laps.map((lap) => {
    const samples = withTraces(lap.samples);
    const len = samples?.length ? samples[samples.length - 1][0] : 0;
    const spins = samples ? spinRanges(samples, spinThreshold) : [];
    line(
      [
        lap.label,
        lap.at ? new Date(lap.at).toLocaleString("pt-BR") : "-",
        sec(lap.ms),
        signedSec(ref ? lap.ms - ref.ms : null),
        ...[0, 1, 2].map((i) => sec(lap.splits?.[i]?.ms)),
        lap.spins ?? "-",
        rangesInMeters(spins, len),
      ].join(";"),
    );
    return { lap, samples, len, analysis: refSamples ? analyzeLap(samples, refSamples, corners, spinThreshold) : null };
  });
  line("```");
  line();

  // Curvas
  if (analyses.some((a) => a.analysis)) {
    line("## Curvas (cada volta vs referência)");
    line("```");
    line("volta;curva;perda_s;freio_m;vmin;afundo_m;patina_saida_m;causa_provavel");
    for (const { lap, analysis } of analyses) {
      for (const c of analysis ?? []) {
        line(
          [
            lap.label,
            `C${c.corner}`,
            signedSec(c.lostMs),
            pair(c.lap.brakeRel, c.ref.brakeRel),
            pair(c.lap.minKmh, c.ref.minKmh),
            pair(c.lap.throttleRel, c.ref.throttleRel),
            pair(c.lap.spinM, c.ref.spinM),
            describeCause(c),
          ].join(";"),
        );
      }
    }
    line("```");
    line();

    // Por curva: média de tempo perdido e em quantas voltas perdeu mais de 0,1 s.
    line("## Resumo por curva");
    line("```");
    line("curva;perda_media_s;voltas_perdendo_mais_0.1s;causa_mais_comum");
    const n = corners?.length ?? 0;
    for (let k = 1; k <= n; k++) {
      const rows = analyses.map((a) => a.analysis?.find((c) => c.corner === k)).filter(Boolean);
      if (!rows.length) continue;
      const avg = rows.reduce((s, c) => s + c.lostMs, 0) / rows.length;
      const losing = rows.filter((c) => c.lostMs > 100).length;
      const causes = {};
      for (const c of rows.filter((r) => r.lostMs > 100)) causes[c.cause] = (causes[c.cause] ?? 0) + 1;
      const common = Object.entries(causes).sort((a, b) => b[1] - a[1])[0];
      const example = common && rows.find((c) => c.cause === common[0] && c.lostMs > 100);
      line(`C${k};${signedSec(Math.round(avg))};${losing}/${rows.length};${example ? describeCause(example) : "-"}`);
    }
    line("```");
    line();
  }

  // Telemetria
  if (includeTelemetry) {
    const block = (title, samples, withDelta) => {
      if (!samples?.length) return;
      const len = samples[samples.length - 1][0];
      line(`### ${title}`);
      line("```");
      line(withDelta ? "dist_m;tempo_s;delta_s;kmh;acel_%;freio_%;patina" : "dist_m;tempo_s;kmh;acel_%;freio_%;patina");
      for (let d = 0; d <= len; d += stepM) {
        const s = sampleAt(samples, d);
        const t = timeAt(samples, d);
        const cols = [Math.round(d), sec(t)];
        // Delta à mesma fração da volta (voltas diferentes têm comprimentos ligeiramente diferentes).
        if (withDelta) cols.push(signedSec(Math.round(t - timeAt(refSamples, (d / len) * refLen))));
        cols.push(s[2] ?? "-", s[3] ?? "-", s[4] ?? "-", s[5] ?? "-");
        line(cols.join(";"));
      }
      line("```");
      line();
    };
    line(`## Telemetria (a cada ${stepM} m)`);
    line();
    block(`Referência (recorde ${fmtTime(ref?.ms)})`, refSamples, false);
    for (const { lap, samples } of analyses) block(`${lap.label} — ${fmtTime(lap.ms)}`, samples, !!refSamples);
  }

  return out.join("\n");
}
