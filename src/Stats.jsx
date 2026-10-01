import { fmtTime } from "./format.js";

const NEAR_MS = 500;
const SLOW_FACTOR = 1.07; // voltas acima de 107% da melhor (acidentes, trânsito) ficam de fora

// Estatísticas de consistência de um conjunto de voltas.
export default function Stats({ laps, excludeSlow }) {
  const all = (laps ?? []).map((l) => l.ms).filter((ms) => ms > 0);
  if (all.length < 2) return null;

  const best = Math.min(...all);
  const times = excludeSlow ? all.filter((ms) => ms <= best * SLOW_FACTOR) : all;
  const n = times.length;
  const mean = times.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(times.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const sorted = [...times].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const near = times.filter((ms) => ms - best <= NEAR_MS).length;
  const ignored = all.length - n;

  return (
    <div className="stats">
      <h2>CONSISTÊNCIA</h2>
      <div className="stat-tiles">
        <Tile label="Voltas" value={n} />
        <Tile label="Média" value={fmtTime(Math.round(mean))} />
        <Tile label="Desvio" value={`±${(sd / 1000).toFixed(3)}`} />
        <Tile label="Mediana" value={fmtTime(Math.round(median))} />
        <Tile label="A < 0,5 s da melhor" value={`${near}/${n}`} sub={`${Math.round((near / n) * 100)}%`} />
      </div>
      {ignored > 0 && (
        <p className="hint">
          {ignored} volta(s) lenta(s) ignorada(s) (acima de 107% da melhor).
        </p>
      )}
    </div>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}
