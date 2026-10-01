import { useTelemetry } from "./useTelemetry.js";
import TrackMap from "./TrackMap.jsx";

const WS_URL = `ws://${location.hostname}:8080`;
const CLASSES = ["D", "C", "B", "A", "S1", "S2", "X"];

function fmtTime(ms) {
  if (ms == null) return "--:--.---";
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
  return `${m}:${s}`;
}

function fmtDelta(ms) {
  if (ms == null) return "--.---";
  return `${ms < 0 ? "-" : "+"}${(Math.abs(ms) / 1000).toFixed(3)}`;
}

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
  const { state, map, online, send } = useTelemetry(WS_URL);
  const t = state?.telemetry;
  const timer = state?.timer;

  let status;
  if (!online) status = <p className="status bad">Sem ligação ao servidor (npm run server)</p>;
  else if (!state?.receiving) status = <p className="status bad">À espera do jogo… (Data Out → 127.0.0.1:8005)</p>;
  else if (timer?.paused) status = <p className="status bad">TELEMETRIA EM PAUSA • cronómetro congelado</p>;
  else if (!timer?.start) status = <p className="status">Conduz até à linha de partida e carrega em «Definir partida»</p>;
  else status = <p className="status good">A gravar</p>;

  const delta = timer?.deltaMs;
  const deltaClass = delta == null ? "" : delta < 0 ? "faster" : "slower";

  return (
    <div className="app">
      <section className="panel">
        <h1>Lap Timer</h1>
        {status}
        {t && (
          <p className="car">
            Carro #{t.carOrdinal} • {CLASSES[t.carClass] ?? "?"} {t.carPI}
          </p>
        )}

        <Row label="VOLTA" value={timer?.lapNumber || "-"} />
        <Row label="ATUAL" value={fmtTime(timer?.start ? timer.currentMs : null)} />
        <Row label="DELTA" value={fmtDelta(delta)} className={deltaClass} />
        <Row label="ÚLTIMA" value={fmtTime(timer?.lastLapMs)} />
        <Row label="MELHOR" value={fmtTime(timer?.bestLapMs)} className="best" />

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
              <li key={i} className={ms === timer.bestLapMs ? "best" : ""}>
                {fmtTime(ms)}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel">
        <h2>MAPA</h2>
        <TrackMap map={map} pos={t} lapNumber={timer?.lapNumber} />
      </section>
    </div>
  );
}
