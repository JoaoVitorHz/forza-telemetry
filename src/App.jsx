import { useTelemetry } from "./useTelemetry.js";
import TrackMap from "./TrackMap.jsx";
import Tracks from "./Tracks.jsx";
import Sectors from "./Sectors.jsx";
import { fmtDelta, fmtTime } from "./format.js";

const WS_URL = `ws://${location.hostname}:8080`;
const CLASSES = ["D", "C", "B", "A", "S1", "S2", "X"];

function Row({ label, value, className }) {
  return (
    <div className="row">
      <span className="label">{label}</span>
      <span className={`value ${className ?? ""}`}>{value}</span>
    </div>
  );
}

function Bar({ value, color }) {
  return (
    <div className="bar">
      <div style={{ width: `${Math.round(value * 100)}%`, background: color }} />
    </div>
  );
}

export default function App() {
  const { state, map, tracks, online, send } = useTelemetry(WS_URL);
  const t = state?.telemetry;
  const timer = state?.timer;

  let status;
  if (!online) status = <p className="status bad">Sem ligação ao servidor (npm run server)</p>;
  else if (!state?.receiving) status = <p className="status bad">À espera do jogo… (Data Out → 127.0.0.1:8005)</p>;
  else if (timer?.paused) status = <p className="status bad">TELEMETRIA EM PAUSA • cronómetro congelado</p>;
  else if (timer?.running)
    status = <p className="status good">{timer.gameTiming ? "A gravar • tempos do jogo" : "A gravar"}</p>;
  else if (timer?.start) status = <p className="status">À espera de passares na partida…</p>;
  else
    status = (
      <p className="status">
        {tracks.length > 0
          ? "Passa na partida de uma pista guardada ou carrega em «Definir partida»"
          : "Conduz até à linha de partida e carrega em «Definir partida»"}
      </p>
    );

  const delta = timer?.deltaMs;
  const deltaClass = delta == null ? "" : delta < 0 ? "faster" : "slower";

  return (
    <div className="app">
      <section className="panel">
        <h1>{timer?.track?.name ?? "Lap Timer"}</h1>
        {status}
        {t && (
          <p className="car">
            Carro #{t.carOrdinal} • {CLASSES[t.carClass] ?? "?"} {t.carPI}
          </p>
        )}

        <Row label="VOLTA" value={timer?.lapNumber || "-"} />
        <Row label="ATUAL" value={fmtTime(timer?.running ? timer.currentMs : null)} />
        <Row label="DELTA" value={fmtDelta(delta)} className={deltaClass} />
        <Row label="ÚLTIMA" value={fmtTime(timer?.lastLapMs)} />
        <Row label="MELHOR (SESSÃO)" value={fmtTime(timer?.sessionBestMs)} />
        <Row label="RECORDE" value={fmtTime(timer?.recordMs)} className="best" />

        <Sectors sectors={timer?.sectors} />

        {t && (
          <div className="live">
            <div className="speed">
              <span>{Math.round(t.speedKmh)}</span> km/h
              <span className="gear">{t.gear === 0 ? "R" : t.gear}</span>
            </div>
            <Bar value={t.maxRpm ? t.rpm / t.maxRpm : 0} color="#f1c40f" />
            <Bar value={t.throttle} color="#2ecc71" />
            <Bar value={t.brake} color="#e74c3c" />
          </div>
        )}

        <div className="buttons">
          <button onClick={() => send({ type: "setStart" })} disabled={!state?.receiving}>
            Definir partida
          </button>
          <button onClick={() => send({ type: "reset" })}>Reiniciar</button>
        </div>

        {timer?.laps.length > 0 && (
          <ol className="laps" start={timer.lapNumber - timer.laps.length}>
            {timer.laps.map((ms, i) => (
              <li key={i} className={ms === timer.recordMs ? "best" : ""}>
                {fmtTime(ms)}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel">
        <h2>MAPA</h2>
        <TrackMap map={map} pos={t} lapNumber={timer?.lapNumber} />
        <Tracks tracks={tracks} timer={timer} send={send} />
      </section>
    </div>
  );
}
