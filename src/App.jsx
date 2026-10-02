import { useEffect, useMemo, useState } from "react";
import { useTelemetry } from "./useTelemetry.js";
import TrackMap from "./TrackMap.jsx";
import Tracks from "./Tracks.jsx";
import Sectors from "./Sectors.jsx";
import LapHistory from "./LapHistory.jsx";
import ExportPanel from "./ExportPanel.jsx";
import TrackView from "./TrackView.jsx";
import Settings from "./Settings.jsx";
import CompareChart from "./CompareChart.jsx";
import LapColorToggle from "./LapColorToggle.jsx";
import LapAnalysis from "./LapAnalysis.jsx";
import CornerTable, { cornerMarks } from "./CornerTable.jsx";
import { analyzeLap, spinRanges, topLosses } from "../shared/analysis.js";
import { miniSectorColors } from "../shared/miniSectors.js";
import { fmtDelta, fmtTime } from "./format.js";
import { askCarName, carLabel } from "./cars.js";

const WS_URL = `ws://${location.hostname}:8080`;

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
  const { state, map, tracks, lapDetail, trackView, savedLap, carNames, settings, lapsExport, online, send } = useTelemetry(WS_URL);
  const t = state?.telemetry;
  const timer = state?.timer;

  // Seletor no topo: null = ao vivo; id = ver uma pista guardada.
  const [view, setView] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const viewExists = view != null && tracks.some((tr) => tr.id === view);
  // Pede os dados da pista ao escolher e sempre que a lista muda (nova volta, novo recorde).
  useEffect(() => {
    if (viewExists) send({ type: "getTrackView", id: view });
  }, [view, viewExists, tracks, online, send]);

  // Volta escolhida no histórico para ver no mapa (null = ao vivo).
  const [selectedLap, setSelectedLap] = useState(null);
  const viewedLap = selectedLap != null && lapDetail?.n === selectedLap ? lapDetail : null;
  const [lapColorMode, setLapColorMode] = useState("sectors");
  const lapAnalysis = useMemo(
    () => (viewedLap ? analyzeLap(viewedLap.samples, viewedLap.refSamples, map?.corners, settings.tractionSensitivity) : null),
    [viewedLap, map?.corners, settings.tractionSensitivity],
  );
  // Trechos onde destracionou nesta volta (marcados a vermelho no mapa).
  const lapSpins = useMemo(
    () => (settings.tractionAlert && viewedLap ? spinRanges(viewedLap.samples, settings.tractionSensitivity) : null),
    [settings.tractionAlert, settings.tractionSensitivity, viewedLap],
  );
  const lapLosses = settings.lapAnalysis && lapAnalysis ? topLosses(lapAnalysis) : null;
  // Curva ampliada no mapa (só numa volta escolhida).
  const [corner, setCorner] = useState(null);
  useEffect(() => setCorner(null), [viewedLap]);
  const lapMini = useMemo(
    () =>
      settings.miniSectors && viewedLap
        ? miniSectorColors(viewedLap.samples, viewedLap.refSamples, settings.miniSectorCount, true)
        : null,
    [settings.miniSectors, settings.miniSectorCount, viewedLap],
  );
  const selectLap = (n) => {
    if (n === selectedLap) return setSelectedLap(null);
    setSelectedLap(n);
    send({ type: "getLap", n });
  };

  let status;
  if (!online) status = <p className="status bad">Sem ligação ao servidor (npm run server)</p>;
  else if (!state?.receiving) status = <p className="status bad">À espera do jogo… (Data Out → 127.0.0.1:8005)</p>;
  else if (timer?.manualPause) status = <p className="status bad">PAUSADO • carrega em «Retomar» para continuar</p>;
  else if (timer?.paused) status = <p className="status bad">TELEMETRIA EM PAUSA • cronómetro congelado</p>;
  else if (timer?.running)
    status = (
      <p className="status good">
        {timer.gameTiming ? "A gravar • tempos do jogo" : timer.autoDetected && !timer.track ? "A gravar • partida detetada automaticamente" : "A gravar"}
      </p>
    );
  else if (timer?.start) status = <p className="status">À espera de passares na partida…</p>;
  else
    status = (
      <p className="status">
        {timer?.scouting
          ? "A procurar circuito… dá uma volta completa e a partida é detetada sozinha"
          : tracks.length > 0
            ? "Passa na partida de uma pista guardada ou carrega em «Definir partida»"
            : "Conduz até à linha de partida e carrega em «Definir partida»"}
      </p>
    );

  const cornerFocus = useMemo(() => {
    const c = corner && lapAnalysis?.find((a) => a.corner === corner);
    const center = c && map?.corners?.[corner - 1];
    return center ? { center, marks: cornerMarks(c, viewedLap.path, map.refPath) } : null;
  }, [corner, lapAnalysis, map, viewedLap]);

  const delta = timer?.deltaMs;
  const deltaClass = delta == null ? "" : delta < 0 ? "faster" : "slower";

  const topbar = (
    <header className="topbar">
      <span className="brand">Forza Telemetry</span>
      <label>
        Pista:{" "}
        <select
          value={viewExists ? view : ""}
          onChange={(e) => {
            setView(e.target.value || null);
            setShowSettings(false);
          }}
        >
          <option value="">Ao vivo</option>
          {tracks.map((tr) => (
            <option key={tr.id} value={tr.id}>
              {tr.name}
              {tr.recordMs != null ? ` — ${fmtTime(tr.recordMs)}` : ""}
            </option>
          ))}
        </select>
      </label>
      <button className={showSettings ? "active" : ""} onClick={() => setShowSettings(!showSettings)}>
        ⚙ Configurações
      </button>
    </header>
  );

  if (showSettings) {
    return (
      <>
        {topbar}
        <Settings settings={settings} send={send} />
      </>
    );
  }

  if (viewExists) {
    return (
      <>
        {topbar}
        <TrackView
          view={trackView?.id === view ? trackView : null}
          savedLap={savedLap}
          activeTrackId={timer?.track?.id}
          liveCar={timer?.car}
          carNames={carNames}
          settings={settings}
          lapsExport={lapsExport}
          send={send}
        />
      </>
    );
  }

  return (
    <>
      {topbar}
      <div className="app">
        <section className="panel">
          <h1>{timer?.track?.name ?? "Lap Timer"}</h1>
          {status}
          {t && (
            <p className="car">
              {carLabel(String(t.carOrdinal), carNames, { class: t.carClass, pi: t.carPI })}
              <button className="link" onClick={() => askCarName(String(t.carOrdinal), carNames, send)} title="Dar nome ao carro">
                ✎
              </button>
            </p>
          )}

          <Row label="VOLTA" value={timer?.lapNumber || "-"} />
          {settings.tractionAlert && (
            <div className="row">
              <span className="label">TRAÇÃO</span>
              {timer?.tractionLoss ? (
                <span className="traction-alert">⚠ DESTRACIONANDO</span>
              ) : (
                <span className="traction-ok">
                  OK{timer?.spinEvents ? ` • destracionou ${timer.spinEvents}× nesta volta` : ""}
                </span>
              )}
            </div>
          )}
          <Row label="ATUAL" value={fmtTime(timer?.running ? timer.currentMs : null)} />
          <div className="row">
            <span className="label">
              DELTA
              <span className="segmented small" role="group" aria-label="Comparar delta com">
                {[
                  ["best", "Recorde"],
                  ["ideal", "Ideal"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={settings.deltaReference === value ? "active" : ""}
                    onClick={() => send({ type: "setSettings", patch: { deltaReference: value } })}
                  >
                    {label}
                  </button>
                ))}
              </span>
            </span>
            <span className={`value ${deltaClass}`}>{fmtDelta(delta)}</span>
          </div>
          <Row label="ÚLTIMA" value={fmtTime(timer?.lastLapMs)} />
          <Row label="MELHOR (SESSÃO)" value={fmtTime(timer?.sessionBestMs)} />
          <Row label="RECORDE" value={fmtTime(timer?.recordMs)} className="best" />
          <Row label="VOLTA IDEAL" value={fmtTime(timer?.idealMs)} className="ideal" />

          <Sectors sectors={timer?.sectors} />
          {settings.lapAnalysis && timer?.lastAnalysis && (
            <LapAnalysis title={`ONDE PERDESTE TEMPO • VOLTA ${timer.lastAnalysis.n}`} items={timer.lastAnalysis.items} />
          )}

          {t && settings.showPedals && (
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
            <button onClick={() => send({ type: "togglePause" })} className={timer?.manualPause ? "active" : ""}>
              {timer?.manualPause ? "Retomar" : "Pausar"}
            </button>
            <button
              onClick={() => {
                send({ type: "reset" });
                setSelectedLap(null);
              }}
            >
              Reiniciar
            </button>
          </div>

          {settings.showLapHistory && <LapHistory laps={timer?.laps} selected={selectedLap} onSelect={selectLap} />}
          {timer?.laps?.length > 0 && (
            <ExportPanel
              source="session"
              carKey={timer.car}
              carName={carLabel(String(timer.car), carNames, t && { class: t.carClass, pi: t.carPI })}
              settings={settings}
              lapsExport={lapsExport}
              send={send}
            />
          )}
        </section>

        <section className="panel">
          <div className="map-header">
            <h2>{viewedLap ? `MAPA • VOLTA ${viewedLap.n} • ${fmtTime(viewedLap.ms)}` : "MAPA"}</h2>
            {lapMini && <LapColorToggle mode={lapColorMode} onChange={setLapColorMode} />}
            {selectedLap != null && <button onClick={() => setSelectedLap(null)}>Ao vivo</button>}
          </div>
          <TrackMap
            map={map}
            pos={t}
            lapNumber={timer?.lapNumber}
            lap={viewedLap}
            ghost={settings.ghost ? timer?.ghost : null}
            miniColors={viewedLap ? lapMini : timer?.miniSectors}
            lapColorMode={lapColorMode}
            showCorners={settings.showCorners}
            selectedCorner={corner}
            onCornerClick={lapAnalysis ? setCorner : undefined}
            focus={cornerFocus}
            spinRanges={lapSpins}
          />
          {viewedLap && settings.compareChart && <CompareChart lap={viewedLap} label={`Volta ${viewedLap.n}`} />}
          {lapLosses && <LapAnalysis title={`ONDE PERDESTE TEMPO • VOLTA ${viewedLap.n}`} items={lapLosses} />}
          {settings.showCorners && <CornerTable analysis={lapAnalysis} selected={corner} onSelect={setCorner} />}
          <Tracks tracks={tracks} timer={timer} settings={settings} send={send} />
        </section>
      </div>
    </>
  );
}
