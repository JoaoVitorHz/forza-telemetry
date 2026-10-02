import { describeCause } from "../shared/analysis.js";

// "Onde perdeste tempo": as curvas com mais tempo perdido para a referência e a causa provável.
export default function LapAnalysis({ title, items }) {
  if (!items) return null;
  return (
    <div className="analysis">
      <h2>{title}</h2>
      {items.length === 0 ? (
        <p className="hint">Sem perdas relevantes em nenhuma curva. 👌</p>
      ) : (
        <ol>
          {items.map((c) => (
            <li key={c.corner}>
              <span className="analysis-corner">Curva {c.corner}</span>
              <span className="analysis-lost">+{(c.lostMs / 1000).toFixed(2).replace(".", ",")} s</span>
              <span className="analysis-cause">{describeCause(c)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
