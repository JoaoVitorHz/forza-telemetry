import { useEffect, useMemo, useState } from "react";
import TrackMap from "./TrackMap.jsx";
import LapHistory from "./LapHistory.jsx";
import { fmtSector, fmtTime } from "./format.js";
import { askCarName, carLabel } from "./cars.js";
import CompareChart from "./CompareChart.jsx";
import LapColorToggle from "./LapColorToggle.jsx";
import Stats from "./Stats.jsx";
import { miniSectorColors } from "../shared/miniSectors.js";

// Vista de uma pista guardada: recordes por carro, mapa e todas as voltas já feitas nela.
export default function TrackView({ view, savedLap, activeTrackId, liveCar, carNames, settings, send }) {
  const [selected, setSelected] = useState(null);
  const [carKey, setCarKey] = useState(null);
  const [lapColorMode, setLapColorMode] = useState("sectors");
  const shownLap = selected && savedLap?.id === selected ? savedLap : null;
  const lapMini = useMemo(
    () =>
      settings.miniSectors && shownLap
        ? miniSectorColors(shownLap.samples, shownLap.refSamples, settings.miniSectorCount, true)
        : null,
    [settings.miniSectors, settings.miniSectorCount, shownLap],
  );

  useEffect(() => setSelected(null), [view?.id, carKey]);

  if (!view) return <p className="hint view-loading">A carregar pista…</p>;

  // Carro mostrado: o escolhido; senão o que estás a conduzir (se já andou aqui); senão o mais rápido.
  const byRecord = [...view.cars].sort((a, b) => (a.recordMs ?? Infinity) - (b.recordMs ?? Infinity));
  const car =
    view.cars.find((c) => c.key === carKey) ?? view.cars.find((c) => c.key === liveCar) ?? byRecord[0] ?? null;

  // Numeração contínua das voltas deste carro (a mais antiga é a 1).
  const laps = view.laps
    .filter((lap) => car && String(lap.car?.ordinal ?? "?") === car.key)
    .map((lap, i) => ({ ...lap, n: i + 1 }));
  const shownN = laps.find((l) => l.id === selected)?.n;

  const select = (id) => {
    if (id === selected) return setSelected(null);
    setSelected(id);
    send({ type: "getSavedLap", trackId: view.id, lapId: id });
  };

  return (
    <div className="app">
      <section className="panel">
        <h1>{view.name}</h1>

        {view.cars.length === 0 ? (
          <p className="hint sectors-hint">Ainda não há voltas nem recordes nesta pista.</p>
        ) : (
          <>
            <div className="car-select">
              <select value={car.key} onChange={(e) => setCarKey(e.target.value)}>
                {byRecord.map((c) => (
                  <option key={c.key} value={c.key}>
                    {carLabel(c.key, carNames, c.info)}
                    {c.recordMs != null ? ` — ${fmtTime(c.recordMs)}` : ""}
                  </option>
                ))}
              </select>
              {car.key !== "?" && (
                <button className="link" onClick={() => askCarName(car.key, carNames, send)} title="Dar nome ao carro">
                  ✎
                </button>
              )}
            </div>
            <p className="car">{laps.length} volta(s) guardada(s) com este carro</p>

            <div className="row">
              <span className="label">RECORDE</span>
              <span className="value best">{fmtTime(car.recordMs)}</span>
            </div>
            <div className="row">
              <span className="label">POSSIBLE BEST</span>
              <span className="value best small">{fmtTime(car.possibleBestMs)}</span>
            </div>
            <div className="sector-best">
              <span className="label">MELHORES</span>
              {car.bestSectors.map((ms, i) => (
                <span key={i}>{ms != null ? fmtSector(ms) : "--"}</span>
              ))}
            </div>
          </>
        )}

        <div className="buttons">
          <button onClick={() => send({ type: "loadTrack", id: view.id })} disabled={activeTrackId === view.id}>
            {activeTrackId === view.id ? "Pista ativa" : "Usar para cronometrar"}
          </button>
        </div>

        {settings.stats && <Stats laps={laps} excludeSlow={settings.statsExcludeSlow} />}
        {laps.length > 0 && <LapHistory laps={laps} selected={selected} onSelect={select} />}
      </section>

      <section className="panel">
        <div className="map-header">
          <h2>{shownLap ? `MAPA • VOLTA ${shownN} • ${fmtTime(shownLap.ms)}` : "MAPA"}</h2>
          {lapMini && <LapColorToggle mode={lapColorMode} onChange={setLapColorMode} />}
          {selected && <button onClick={() => setSelected(null)}>Recorde</button>}
        </div>
        <TrackMap
          map={{
            start: view.start,
            refPath: car?.refPath ?? view.path,
            sectors: view.sectors,
            mapVersion: `${view.id}-${car?.key}`,
          }}
          lap={shownLap}
          miniColors={lapMini}
          lapColorMode={lapColorMode}
        />
        {shownLap && settings.compareChart && <CompareChart lap={shownLap} label={`Volta ${shownN}`} />}
      </section>
    </div>
  );
}
