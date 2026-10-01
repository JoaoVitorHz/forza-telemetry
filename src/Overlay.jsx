import { useEffect } from "react";
import { useTelemetry } from "./useTelemetry.js";
import Sectors from "./Sectors.jsx";
import TrackMap from "./TrackMap.jsx";
import { fmtDelta, fmtTime } from "./format.js";

const WS_URL = `ws://${location.hostname}:8080`;

// Versão compacta para ficar por cima do jogo (janela Electron ou fonte de browser no OBS).
// Arrasta-se pela barra de cima; o fundo usa a opacidade definida nas Configurações.
export default function Overlay() {
  const { state, map, settings } = useTelemetry(WS_URL);
  const timer = state?.timer;
  const t = state?.telemetry;

  useEffect(() => {
    document.body.classList.add("overlay-body");
  }, []);

  const delta = timer?.deltaMs;
  const deltaClass = delta == null ? "" : delta < 0 ? "faster" : "slower";
  const alpha = Math.max(0, Math.min(100, settings.overlayOpacity)) / 100;

  return (
    <div className="overlay" style={{ background: `rgba(10, 10, 10, ${alpha})` }}>
      <div className="overlay-bar">
        <span>
          {timer?.track?.name ?? "Lap Timer"}
          {timer?.lapNumber ? ` • Volta ${timer.lapNumber}` : ""}
        </span>
        <button onClick={() => window.close()} title="Fechar">
          ✕
        </button>
      </div>

      {!state?.receiving ? (
        <p className="overlay-wait">À espera do jogo…</p>
      ) : (
        <>
          <div className={`overlay-delta ${deltaClass}`}>{fmtDelta(delta)}</div>
          <div className="overlay-times">
            <span>Volta</span>
            <b>{fmtTime(timer?.running ? timer.currentMs : null)}</b>
            <span>Última</span>
            <b>{fmtTime(timer?.lastLapMs)}</b>
            <span>Recorde</span>
            <b className="best">{fmtTime(timer?.recordMs)}</b>
          </div>
          {settings.overlaySectors && <Sectors sectors={timer?.sectors} compact />}
          {settings.overlayMap && (
            <TrackMap map={map} pos={t} lapNumber={timer?.lapNumber} ghost={settings.ghost ? timer?.ghost : null} />
          )}
        </>
      )}
    </div>
  );
}
