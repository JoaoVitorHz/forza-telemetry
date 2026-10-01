import { fmtDelta, fmtSector, fmtTime } from "./format.js";

// Três setores estilo F1. Mostra os setores da volta atual; os que ainda não foram
// feitos mostram (esbatidos) os da volta anterior.
export default function Sectors({ sectors }) {
  if (!sectors?.enabled) {
    return <p className="hint sectors-hint">Os setores aparecem depois da primeira volta completa.</p>;
  }

  return (
    <div className="sectors">
      <div className="sector-boxes">
        {[0, 1, 2].map((i) => {
          const current = sectors.current[i];
          const split = current ?? sectors.last[i];
          return (
            <div key={i} className={`sector ${split?.color ?? ""} ${current ? "" : "stale"}`}>
              <span className="sector-label">S{i + 1}</span>
              <span className="sector-time">{split ? fmtSector(split.ms) : "--"}</span>
              <span className="sector-delta">{split?.deltaMs != null ? fmtDelta(split.deltaMs) : " "}</span>
            </div>
          );
        })}
      </div>

      <div className="sector-best">
        <span className="label">MELHORES</span>
        {sectors.best.map((ms, i) => (
          <span key={i}>{ms != null ? fmtSector(ms) : "--"}</span>
        ))}
      </div>
      <div className="row">
        <span className="label">POSSIBLE BEST</span>
        <span className="value best small">{fmtTime(sectors.possibleBestMs)}</span>
      </div>
    </div>
  );
}
