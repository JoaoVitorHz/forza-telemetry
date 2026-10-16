import { analyzeLap, balanceOf, describeCause, spinRanges, withTraces } from "../shared/analysis.js";
import { fmtTime } from "./format.js";

// Relatório em texto para colar num chat (ou guardar em ficheiro) e pedir uma análise:
// resumo, tabela das voltas, curva a curva em todas as voltas e, opcionalmente, telemetria.
// Colunas das amostras: ver shared/analysis.js (voltas antigas têm menos colunas → "-").

const sec = (ms) => (ms == null ? "--" : (ms / 1000).toFixed(3));
const signedSec = (ms) => (ms == null ? "--" : `${ms >= 0 ? "+" : ""}${(ms / 1000).toFixed(3)}`);
const pair = (a, b) => `${a ?? "-"}/${b ?? "-"}`;
const val = (v, digits = 0) => (v == null ? "-" : typeof v === "number" ? v.toFixed(digits) : v);

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

// % do tempo da volta a fundo (acelerador ≥ 95%), a travar (travão ≥ 10%) e sem pedal (nenhum dos dois).
function pedalShares(samples) {
  let full = 0;
  let braking = 0;
  let coasting = 0;
  let total = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i][1] - samples[i - 1][1];
    const [, , , thr, brk] = samples[i];
    if (dt <= 0 || thr == null) continue;
    total += dt;
    if (thr >= 95) full += dt;
    if (brk >= 10) braking += dt;
    if (thr < 10 && brk < 10) coasting += dt;
  }
  if (!total) return ["-", "-", "-"];
  return [full, braking, coasting].map((t) => Math.round((t / total) * 100));
}

// "2: C3 1250 m (-38 km/h), 2810 m (-52 km/h, freando)" — curva mais próxima (até 80 m).
function impactsText(impacts, corners, len) {
  if (impacts == null) return "-";
  if (!impacts.length) return "0";
  const where = (dist) => {
    let best = null;
    corners?.forEach((c, i) => {
      const gap = Math.abs(c.frac * len - dist);
      if (gap <= 80 && (!best || gap < best.gap)) best = { name: `C${i + 1}`, gap };
    });
    return best ? `${best.name} ${dist} m` : `${dist} m`;
  };
  return `${impacts.length}: ${impacts.map((i) => `${where(i.dist)} (-${i.kmhLost} km/h${i.braking ? ", freando" : ""})`).join(", ")}`;
}

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
  line("- Tempos em segundos. \"dif\", \"perda\" e \"delta\" = volta − referência (positivo = mais lento).");
  line("- Referência = recorde deste carro nesta pista. Pares \"a/b\" = volta/referência.");
  line("- Voltas \"(inválida)\": distância muito diferente do normal (atalho, desvio ou erro de contagem);");
  line("  aparecem na tabela mas ficam fora da análise das curvas e da telemetria.");
  line("- Voltas \"(parcial)\": tentativas reiniciadas antes do fim; o tempo é até onde chegaram.");
  line("- a_fundo / freando / sem_pedal: % do tempo da volta com acelerador ≥ 95%, freio ≥ 10%, ou nenhum dos dois.");
  line("- Curvas: v_entrada = velocidade quando começa a frear (ou a máxima antes da curva, se não frear);");
  line("  vmin = mínima na curva; v_saida = 100 m depois do vértice (km/h).");
  line("- freio_m / afundo_m: distância do ponto de freada / de acelerador a fundo até o vértice (negativo = antes).");
  line("- freio_ate_volante_m: metros entre começar a frear e começar a virar o volante (0 = freia e vira juntos).");
  line("- marcha: marcha no vértice. g_lat: força G lateral máxima na curva. g_freada: desaceleração máxima (G).");
  line("- comportamento: frente = saiu de frente (subesterço), traseira = saiu de traseira (sobre-esterço), neutro.");
  line("  deriva_f / deriva_t: ângulo de deriva médio das rodas da frente / de trás (graus).");
  line(`- Destracionar = rodas de tração patinando acima de ${spinThreshold} (×100) com acelerador > 30%.`);
  line("- patina: patinagem das rodas de tração ×100 (≈10 acelerando normal, 40+ destracionando).");
  line("- batidas: perda de 20+ km/h em 0,25 s sem frear (ou 45+ freando). Formato: curva mais próxima, metro, km/h perdidos.");
  line("  Batidas apagadas pelo retroceder do jogo não aparecem.");
  line("- g_lat: + = carro empurrado para um lado, − = para o outro. g_long: + acelerando, − freando.");
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
  if (refSamples) line(`- Referência: a fundo/freando/sem pedal = ${pedalShares(refSamples).join("% / ")}%`);
  if (corners?.length && refLen) {
    line(`- Curvas detetadas (posição do vértice na referência): ${corners.map((c, i) => `C${i + 1} ${Math.round(c.frac * refLen)} m`).join(", ")}`);
  }
  line();

  // Voltas
  line("## Voltas");
  line("```");
  line("volta;data;tempo;dif_ref;S1;S2;S3;a_fundo_%;freando_%;sem_pedal_%;destracionou;trechos_destracionando;batidas");
  const analyses = laps.map((lap) => {
    const samples = withTraces(lap.samples);
    const len = samples?.length ? samples[samples.length - 1][0] : 0;
    const spins = samples ? spinRanges(samples, spinThreshold) : [];
    line(
      [
        lap.label + (lap.invalid ? " (inválida)" : lap.partial ? " (parcial)" : ""),
        lap.at ? new Date(lap.at).toLocaleString("pt-BR") : "-",
        sec(lap.ms),
        signedSec(ref ? lap.ms - ref.ms : null),
        ...[0, 1, 2].map((i) => sec(lap.splits?.[i]?.ms)),
        ...(samples ? pedalShares(samples) : ["-", "-", "-"]),
        lap.spins ?? "-",
        rangesInMeters(spins, len),
        impactsText(lap.impacts, corners, len),
      ].join(";"),
    );
    const usable = refSamples && !lap.invalid && !lap.partial;
    return { lap, samples, len, analysis: usable ? analyzeLap(samples, refSamples, corners, spinThreshold) : null };
  });
  line("```");
  line();

  // Curvas
  if (analyses.some((a) => a.analysis)) {
    line("## Curvas (cada volta vs referência, pares volta/referência)");
    line("```");
    line(
      "volta;curva;perda_s;v_entrada;vmin;v_saida;freio_m;freio_ate_volante_m;afundo_m;marcha;g_lat;g_freada;comportamento;patina_saida_m;causa_provavel",
    );
    for (const { lap, analysis } of analyses) {
      for (const c of analysis ?? []) {
        const [a, b] = [c.lap, c.ref];
        line(
          [
            lap.label,
            `C${c.corner}`,
            signedSec(c.lostMs),
            pair(a.entryKmh, b.entryKmh),
            pair(a.minKmh, b.minKmh),
            pair(a.exitKmh, b.exitKmh),
            pair(a.brakeRel, b.brakeRel),
            pair(a.brakeToTurnInM, b.brakeToTurnInM),
            pair(a.throttleRel, b.throttleRel),
            pair(a.apexGear, b.apexGear),
            pair(a.maxLatG?.toFixed(2), b.maxLatG?.toFixed(2)),
            pair(a.maxBrakeG?.toFixed(2), b.maxBrakeG?.toFixed(2)),
            pair(a.balance, b.balance),
            pair(a.spinM, b.spinM),
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
    line("curva;perda_media_s;voltas_perdendo_mais_0.1s;saiu_de_frente;saiu_de_traseira;causa_mais_comum");
    const n = corners?.length ?? 0;
    for (let k = 1; k <= n; k++) {
      const rows = analyses.map((a) => a.analysis?.find((c) => c.corner === k)).filter(Boolean);
      if (!rows.length) continue;
      const avg = rows.reduce((s, c) => s + c.lostMs, 0) / rows.length;
      const losing = rows.filter((c) => c.lostMs > 100);
      const causes = {};
      for (const c of losing) causes[c.cause] = (causes[c.cause] ?? 0) + 1;
      const common = Object.entries(causes).sort((a, b) => b[1] - a[1])[0];
      const example = common && losing.find((c) => c.cause === common[0]);
      const count = (side) => rows.filter((c) => c.lap.balance === side).length;
      line(
        `C${k};${signedSec(Math.round(avg))};${losing.length}/${rows.length};${count("frente")}/${rows.length};${count("traseira")}/${rows.length};${example ? describeCause(example) : "-"}`,
      );
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
      line(
        `dist_m;tempo_s;${withDelta ? "delta_s;" : ""}kmh;marcha;rpm;acel_%;freio_%;g_lat;g_long;deriva_f;deriva_t;comportamento;patina`,
      );
      for (let d = 0; d <= len; d += stepM) {
        const s = sampleAt(samples, d);
        const t = timeAt(samples, d);
        const cols = [Math.round(d), sec(t)];
        // Delta à mesma fração da volta (voltas diferentes têm comprimentos ligeiramente diferentes).
        if (withDelta) cols.push(signedSec(Math.round(t - timeAt(refSamples, (d / len) * refLen))));
        const extra = s.length >= 13;
        const behaviour = extra && s[2] > 30 ? balanceOf(s[11] - s[12]) : null;
        cols.push(
          val(s[2]),
          extra ? s[7] : "-",
          extra ? s[8] : "-",
          val(s[3]),
          val(s[4]),
          extra ? (s[9] / 100).toFixed(2) : "-",
          extra ? (s[10] / 100).toFixed(2) : "-",
          extra ? s[11] : "-",
          extra ? s[12] : "-",
          behaviour && behaviour !== "neutro" ? behaviour : "-",
          val(s[5]),
        );
        line(cols.join(";"));
      }
      line("```");
      line();
    };
    line(`## Telemetria (a cada ${stepM} m)`);
    line();
    block(`Referência (recorde ${fmtTime(ref?.ms)})`, refSamples, false);
    for (const { lap, samples } of analyses) {
      if (!lap.invalid && !lap.partial) block(`${lap.label} — ${fmtTime(lap.ms)}`, samples, !!refSamples);
    }
  }

  return out.join("\n");
}
