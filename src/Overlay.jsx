import { useEffect } from "react";
import { useTelemetry } from "./useTelemetry.js";
import Sectors from "./Sectors.jsx";
import TrackMap from "./TrackMap.jsx";
import { fmtDelta, fmtTime } from "./format.js";

const WS_URL = `ws://${location.hostname}:8080`;

// Overlays para ficar por cima do jogo (janelas Electron ou fontes de browser no OBS).
// Cada um tem o seu endereço: ?overlay=delta | sectors | map | times. Arrastam-se pela barra de cima;
// o fundo usa a opacidade definida nas Configurações.
const KINDS = {
  delta: { title: "Delta", Body: DeltaBody },
  sectors: { title: "Setores", Body: SectorsBody },
  map: { title: "Mapa", Body: MapBody },
  times: { title: "Tempos", Body: TimesBody },
};

export default function Overlay({ kind }) {
  const telemetry = useTelemetry(WS_URL);
  const { state, settings } = telemetry;
  const { title, Body } = KINDS[kind] ?? KINDS.delta;

  useEffect(() => {
    document.body.classList.add("overlay-body");
    document.title = `Overlay • ${title}`;
  }, [title]);

  const alpha = Math.max(0, Math.min(100, settings.overlayOpacity)) / 100;

  return (
    <div className="overlay" style={{ background: `rgba(10, 10, 10, ${alpha})` }}>
      <div className="overlay-bar">
        <span>{title}</span>
        <button onClick={() => window.close()} title="Fechar">
          ✕
        </button>
      </div>
      {state?.receiving ? <Body {...telemetry} /> : <p className="overlay-wait">À espera do jogo…</p>}
    </div>
  );
}

function DeltaBody({ state, settings }) {
  const timer = state?.timer;
  const delta = timer?.deltaMs;
  const deltaClass = delta == null ? "" : delta < 0 ? "faster" : "slower";
  return (
    <>
      <div className={`overlay-delta ${deltaClass}`}>{fmtDelta(delta)}</div>
      <div className="overlay-sub">
        <span>
          {timer?.lapNumber ? `Volta ${timer.lapNumber}` : ""} • vs {timer?.deltaMode === "ideal" ? "ideal" : "recorde"}
        </span>
        <b>{fmtTime(timer?.running ? timer.currentMs : null)}</b>
      </div>
      {settings.tractionAlert && timer?.tractionLoss && <div className="overlay-traction">⚠ DESTRACIONANDO</div>}
    </>
  );
}

function SectorsBody({ state }) {
  const sectors = state?.timer?.sectors;
  if (!sectors?.enabled) return <p className="overlay-wait">Os setores aparecem depois da primeira volta.</p>;
  return <Sectors sectors={sectors} compact />;
}

function MapBody({ state, map, settings }) {
  const timer = state?.timer;
  return (
    <TrackMap
      map={map}
      pos={state?.telemetry}
      lapNumber={timer?.lapNumber}
      ghost={settings.ghost ? timer?.ghost : null}
      miniColors={timer?.miniSectors}
    />
  );
}

// Melhor volta (recorde do carro), volta ideal e última volta, com a diferença da última para o recorde.
function TimesBody({ state }) {
  const timer = state?.timer;
  const last = timer?.lastLapMs;
  const best = timer?.recordMs;
  const gap = last != null && best != null ? last - best : null;
  return (
    <div className="overlay-times">
      <span>Melhor volta</span>
      <b className="best">{fmtTime(best)}</b>
      <span>Volta ideal</span>
      <b className="ideal">{fmtTime(timer?.idealMs)}</b>
      <span>Última volta</span>
      <b>
        {fmtTime(last)}
        {gap != null && gap !== 0 && <small className={gap < 0 ? "faster" : "slower"}> {fmtDelta(gap)}</small>}
      </b>
    </div>
  );
}
