import { fmtSector, fmtTime } from "./format.js";

// Histórico das voltas da sessão (mais recente em cima), com as cores que cada
// tempo teve no momento: roxo = melhor de sempre, verde = melhor da sessão, amarelo = mais lento.
// Clicar numa volta mostra o traçado dela no mapa; clicar outra vez volta ao vivo.
export default function LapHistory({ laps, selected, onSelect }) {
  if (!laps?.length) return null;

  return (
    <div className="history">
      <h2>VOLTAS</h2>
      <div className="history-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Tempo</th>
              <th>S1</th>
              <th>S2</th>
              <th>S3</th>
            </tr>
          </thead>
          <tbody>
            {[...laps].reverse().map((lap) => {
              const key = lap.id ?? lap.n; // voltas guardadas têm id; as da sessão usam o número
              return (
              <tr
                key={key}
                onClick={() => onSelect(key)}
                className={key === selected ? "selected" : ""}
                title={lap.at ? new Date(lap.at).toLocaleString() : undefined}
              >
                <td className="lap-n">{lap.n}</td>
                <td className={lap.color}>{fmtTime(lap.ms)}</td>
                {[0, 1, 2].map((i) => {
                  const s = lap.splits?.[i];
                  return (
                    <td key={i} className={s?.color ?? "none"}>
                      {s ? fmtSector(s.ms) : "--"}
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
