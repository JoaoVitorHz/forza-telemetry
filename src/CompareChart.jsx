import { useMemo, useState } from "react";
import { fmtDelta } from "./format.js";

// Comparação de uma volta com o recorde ao longo da distância percorrida.
// Pequenos gráficos empilhados com o mesmo eixo X (distância): delta, velocidade, acelerador, travão.
// Amostras: [distância m, tempo ms, km/h, acelerador %, travão %]

const W = 600;
const LEFT = 46;
const RIGHT = 8;
const PANEL_H = 70;
const GAP = 18;
const LAP_COLOR = "#3b8fe0";
const REF_COLOR = "#c97a24"; // validado contra o fundo escuro (daltonismo incluído)
const MAX_POINTS = 600;

// Valor da coluna `col` à distância d (interpolação linear).
function valueAt(samples, d, col) {
  let lo = 0;
  let hi = samples.length - 1;
  if (d <= samples[0][0]) return samples[0][col];
  if (d >= samples[hi][0]) return samples[hi][col];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid][0] <= d) lo = mid;
    else hi = mid;
  }
  const [d0] = samples[lo];
  const [d1] = samples[hi];
  const f = d1 === d0 ? 0 : (d - d0) / (d1 - d0);
  return samples[lo][col] + f * (samples[hi][col] - samples[lo][col]);
}

function thin(points) {
  if (points.length <= MAX_POINTS) return points;
  const step = points.length / MAX_POINTS;
  const out = [];
  for (let i = 0; i < points.length; i += step) out.push(points[Math.floor(i)]);
  out.push(points[points.length - 1]);
  return out;
}

export default function CompareChart({ lap, label }) {
  const [hoverD, setHoverD] = useState(null);
  const samples = lap?.samples;
  const ref = lap?.refSamples;

  const data = useMemo(() => {
    if (!samples?.length || !ref?.length) return null;
    const maxD = Math.min(samples[samples.length - 1][0], ref[ref.length - 1][0]);
    const hasTraces = samples[0].length >= 5 && ref[0].length >= 5;
    const within = samples.filter((s) => s[0] <= maxD);
    const delta = within.map((s) => [s[0], (s[1] - valueAt(ref, s[0], 1)) / 1000]);
    const maxAbsDelta = Math.max(0.1, ...delta.map(([, v]) => Math.abs(v)));
    const panels = [
      { key: "delta", title: "Delta (s)", min: -maxAbsDelta, max: maxAbsDelta, series: [{ pts: delta, color: "#ddd" }], fmt: (v) => fmtDelta(v * 1000), zero: true },
    ];
    if (hasTraces) {
      const maxSpeed = Math.max(...within.map((s) => s[2]), ...ref.map((s) => s[2]));
      const traces = (col) => [
        { pts: ref.filter((s) => s[0] <= maxD).map((s) => [s[0], s[col]]), color: REF_COLOR, dashed: true },
        { pts: within.map((s) => [s[0], s[col]]), color: LAP_COLOR },
      ];
      panels.push(
        { key: "speed", title: "Velocidade (km/h)", min: 0, max: Math.ceil(maxSpeed / 50) * 50 || 50, series: traces(2), col: 2, fmt: (v) => `${Math.round(v)}` },
        { key: "throttle", title: "Acelerador (%)", min: 0, max: 100, series: traces(3), col: 3, fmt: (v) => `${Math.round(v)}%` },
        { key: "brake", title: "Travão (%)", min: 0, max: 100, series: traces(4), col: 4, fmt: (v) => `${Math.round(v)}%` },
      );
    }
    for (const p of panels) p.series.forEach((s) => (s.pts = thin(s.pts)));
    return { maxD, panels, delta };
  }, [samples, ref]);

  if (!samples?.length) return null;
  if (!data) return <p className="hint chart-hint">Sem recorde deste carro para comparar.</p>;

  const { maxD, panels } = data;
  const H = panels.length * (PANEL_H + GAP) + 24;
  const x = (d) => LEFT + (d / maxD) * (W - LEFT - RIGHT);
  const panelTop = (i) => 24 + i * (PANEL_H + GAP);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const d = ((vx - LEFT) / (W - LEFT - RIGHT)) * maxD;
    setHoverD(d >= 0 && d <= maxD ? d : null);
  };

  return (
    <div className="chart">
      <div className="chart-legend">
        <span>
          <i style={{ background: LAP_COLOR }} /> {label}
        </span>
        <span>
          <i className="dashed" style={{ borderColor: REF_COLOR }} /> Recorde
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} onPointerLeave={() => setHoverD(null)} role="img" aria-label={`Comparação de ${label} com o recorde`}>
        {panels.map((p, i) => {
          const top = panelTop(i);
          const y = (v) => top + PANEL_H - ((v - p.min) / (p.max - p.min)) * PANEL_H;
          return (
            <g key={p.key}>
              <text x={LEFT} y={top - 6} className="chart-title">
                {p.title}
              </text>
              <line x1={LEFT} x2={W - RIGHT} y1={top + PANEL_H} y2={top + PANEL_H} className="chart-axis" />
              {p.zero && <line x1={LEFT} x2={W - RIGHT} y1={y(0)} y2={y(0)} className="chart-grid" />}
              <text x={LEFT - 6} y={top + 8} className="chart-tick" textAnchor="end">
                {p.zero ? `+${p.max.toFixed(1)}` : p.max}
              </text>
              <text x={LEFT - 6} y={top + PANEL_H} className="chart-tick" textAnchor="end">
                {p.zero ? `-${p.max.toFixed(1)}` : p.min}
              </text>
              {p.series.map((s, j) => (
                <polyline
                  key={j}
                  points={s.pts.map(([d, v]) => `${x(d).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeDasharray={s.dashed ? "5 3" : undefined}
                  strokeLinejoin="round"
                />
              ))}
            </g>
          );
        })}
        <text x={W - RIGHT} y={H - 4} className="chart-tick" textAnchor="end">
          {Math.round(maxD)} m
        </text>
        {hoverD != null && (
          <line x1={x(hoverD)} x2={x(hoverD)} y1={18} y2={H - 16} className="chart-crosshair" />
        )}
      </svg>
      {hoverD != null && (
        <div className="chart-readout">
          <span>{Math.round(hoverD)} m</span>
          {panels.map((p) =>
            p.zero ? (
              <span key={p.key}>Delta {fmtDelta(valueAt(data.delta, hoverD, 1) * 1000)}</span>
            ) : (
              <span key={p.key}>
                {p.title.split(" ")[0]} {p.fmt(valueAt(samples, hoverD, p.col))} / {p.fmt(valueAt(ref, hoverD, p.col))}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
