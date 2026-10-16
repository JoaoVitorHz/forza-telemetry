import { fmtDelta, fmtSector } from "./format.js";

// Faixa com os 25 trechos de uma volta (as mesmas cores do mapa). Passar o rato mostra os tempos.
export default function SegmentStrip({ segments, label }) {
  if (!segments) return null;
  const { colors, mine, best, rec } = segments;
  const done = mine.filter((ms) => ms != null).length;
  const purple = colors.filter((c) => c === "purple").length;
  const faster = colors.filter((c) => c === "purple" || c === "green").length;

  return (
    <div className="segments">
      <h2>TRECHOS • {label}</h2>
      <div className="segment-strip" role="list">
        {colors.map((color, k) => (
          <span
            key={k}
            role="listitem"
            className={`segment ${color ?? "none"}`}
            title={
              mine[k] == null
                ? `Trecho ${k + 1}: não feito`
                : `Trecho ${k + 1}: ${fmtSector(mine[k])}` +
                  ` • melhor ${fmtSector(best[k])}` +
                  (rec?.[k] != null ? ` • recorde ${fmtSector(rec[k])} (${fmtDelta(mine[k] - rec[k])})` : "")
            }
          />
        ))}
      </div>
      <p className="hint">
        Fez {done} de {colors.length} trechos • melhor de sempre em {purple} • mais rápido que o recorde em {faster}.
      </p>
    </div>
  );
}
