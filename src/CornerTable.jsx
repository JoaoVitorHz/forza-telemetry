import { pointAlongPath } from "./geometry.js";

export const LAP_MARK = "#3b8fe0";
export const REF_MARK = "#c97a24";

const signed = (v, unit) => (v == null ? "--" : `${v > 0 ? "+" : ""}${v} ${unit}`);
const rel = (v) => (v == null ? "--" : `${Math.abs(v)} m ${v < 0 ? "antes" : "depois"}`);

// Marcas de uma curva para o mapa ampliado: travagem (T), velocidade mínima e acelerar a fundo (A),
// da volta (azul) e da referência (laranja). As distâncias passam a pontos do traçado de cada uma.
export function cornerMarks(c, lapPath, refPath) {
  const marks = [];
  const add = (path, m, color) => {
    const at = (dist) => (dist == null ? null : pointAlongPath(path, dist / m.len));
    const brake = at(m.brakeDist);
    const apex = at(m.apexDist);
    const throttle = at(m.throttleDist);
    if (brake) marks.push({ ...brake, color, label: "T" });
    if (apex && m.minKmh != null) marks.push({ ...apex, color, label: `${m.minKmh}` });
    if (throttle) marks.push({ ...throttle, color, label: "A" });
  };
  add(refPath, c.ref, REF_MARK);
  add(lapPath, c.lap, LAP_MARK);
  return marks;
}

// Tabela curva a curva de uma volta contra a referência. Clicar numa linha amplia essa curva no mapa.
export default function CornerTable({ analysis, selected, onSelect }) {
  if (!analysis?.length) return null;
  const pick = analysis.find((c) => c.corner === selected);
  return (
    <div className="corners">
      <h2>CURVAS</h2>
      <div className="history-scroll">
        <table>
          <thead>
            <tr>
              <th>Curva</th>
              <th>Tempo</th>
              <th>Travagem</th>
              <th>Vel. mín.</th>
              <th>A fundo</th>
            </tr>
          </thead>
          <tbody>
            {analysis.map((c) => (
              <tr key={c.corner} className={c.corner === selected ? "selected" : ""} onClick={() => onSelect(c.corner === selected ? null : c.corner)}>
                <td className="lap-n">C{c.corner}</td>
                <td className={c.lostMs > 50 ? "slower" : c.lostMs < -50 ? "faster" : ""}>
                  {c.lostMs > 0 ? "+" : ""}
                  {(c.lostMs / 1000).toFixed(2)}
                </td>
                <td>{signed(c.brakeDiffM, "m")}</td>
                <td>{signed(c.minSpeedDiff, "km/h")}</td>
                <td>{signed(c.throttleDiffM, "m")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pick && (
        <div className="corner-detail">
          <span>
            <i style={{ background: LAP_MARK }} /> Tu: trava {rel(pick.lap.brakeRel)} do vértice, mín. {pick.lap.minKmh ?? "--"} km/h, a
            fundo {rel(pick.lap.throttleRel)}
          </span>
          <span>
            <i style={{ background: REF_MARK }} /> Referência: trava {rel(pick.ref.brakeRel)} do vértice, mín. {pick.ref.minKmh ?? "--"} km/h,
            a fundo {rel(pick.ref.throttleRel)}
          </span>
        </div>
      )}
      <p className="hint corners-hint">Travagem negativa = travaste antes da referência. A fundo positivo = aceleraste mais tarde.</p>
    </div>
  );
}
