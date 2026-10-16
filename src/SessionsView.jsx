import { useEffect, useMemo, useState } from "react";
import TrackMap from "./TrackMap.jsx";
import LapHistory from "./LapHistory.jsx";
import CompareChart from "./CompareChart.jsx";
import LapAnalysis from "./LapAnalysis.jsx";
import CornerTable, { cornerMarks } from "./CornerTable.jsx";
import SegmentStrip from "./SegmentStrip.jsx";
import LapColorToggle from "./LapColorToggle.jsx";
import ExportPanel from "./ExportPanel.jsx";
import { analyzeLap, spinRanges, topLosses } from "../shared/analysis.js";
import { segmentColors } from "../shared/segments.js";
import { carLabel } from "./cars.js";
import { fmtTime } from "./format.js";

const NO_TRACK = "Pista não guardada";
const groupKey = (lap) => `${lap.trackName ?? NO_TRACK}|${lap.car?.ordinal ?? "?"}`;
const fmtDate = (iso) =>
  new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const minutes = (a, b) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 60000));

// Sessões anteriores: lista à esquerda, volta escolhida no centro (mapa, trechos, gráfico, análise),
// voltas da sessão e exportar à direita. Separado do ao vivo.
export default function SessionsView({ sessions, sessionView, sessionLap, carNames, settings, lapsExport, send }) {
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? null);
  const [group, setGroup] = useState(null);
  const [lapId, setLapId] = useState(null);
  const [lapColorMode, setLapColorMode] = useState("sectors");
  const [corner, setCorner] = useState(null);

  useEffect(() => {
    if ((!sessionId || !sessions.some((s) => s.id === sessionId)) && sessions.length) setSessionId(sessions[0].id);
  }, [sessions, sessionId]);
  useEffect(() => {
    if (sessionId) send({ type: "getSession", id: sessionId });
    setLapId(null);
    setGroup(null);
  }, [sessionId, send]);
  useEffect(() => setCorner(null), [lapId]);

  const view = sessionView?.id === sessionId ? sessionView : null;
  // Pista + carro (uma sessão pode ter vários): por defeito o grupo com mais voltas.
  const groups = useMemo(() => {
    const counts = {};
    for (const l of view?.laps ?? []) counts[groupKey(l)] = (counts[groupKey(l)] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([key]) => key);
  }, [view]);
  const activeGroup = group && groups.includes(group) ? group : groups[0];
  const laps = useMemo(
    () => (view?.laps ?? []).filter((l) => groupKey(l) === activeGroup).map((l, i) => ({ ...l, n: i + 1 })),
    [view, activeGroup],
  );
  const lap = lapId && sessionLap?.id === lapId ? sessionLap : null;
  const lapN = laps.find((l) => l.id === lapId)?.n;

  const analysis = useMemo(
    () => (lap && !lap.partial ? analyzeLap(lap.samples, lap.refSamples, lap.corners, settings.tractionSensitivity) : null),
    [lap, settings.tractionSensitivity],
  );
  const losses = settings.lapAnalysis && analysis ? topLosses(analysis) : null;
  const segments = useMemo(() => (lap?.gateTimes ? segmentColors(lap, laps) : null), [lap, laps]);
  const spins = useMemo(
    () => (settings.tractionAlert && lap ? spinRanges(lap.samples, settings.tractionSensitivity) : null),
    [lap, settings.tractionAlert, settings.tractionSensitivity],
  );
  const focusData = corner && analysis?.find((a) => a.corner === corner);
  const focusCenter = focusData && lap.corners?.[corner - 1];
  const cornerFocus = focusCenter ? { center: focusCenter, marks: cornerMarks(focusData, lap.path, lap.refPath) } : null;

  const selectLap = (id) => {
    if (id === lapId) return setLapId(null);
    setLapId(id);
    send({ type: "getSessionLap", id: sessionId, lapId: id });
  };

  const deleteLap = (l) => {
    if (l.id === lapId) setLapId(null);
    send({ type: "deleteSessionLaps", sessionId, lapIds: [l.id] });
  };
  const deleteSession = (s) => {
    if (!confirm(`Apagar a sessão de ${fmtDate(s.startedAt)} com ${s.laps} volta(s)? As voltas saem também do histórico das pistas. Não dá para desfazer.`)) return;
    if (s.id === sessionId) setSessionId(null);
    send({ type: "deleteSessionLaps", sessionId: s.id });
  };

  const [trackName, carKey] = (activeGroup ?? "|").split("|");
  const groupLabel = (key) => {
    const [t, c] = key.split("|");
    return `${t} • ${carLabel(c, carNames)}`;
  };

  return (
    <div className="app">
      <section className="panel">
        <h1>Sessões</h1>
        <p className="car">Todas as voltas gravadas, de qualquer pista. Uma sessão acaba após 30 min sem voltas.</p>
        {sessions.length === 0 ? (
          <p className="hint">Ainda não há sessões gravadas. As voltas que fizeres a partir de agora ficam aqui.</p>
        ) : (
          <ul className="session-list">
            {sessions.map((s) => {
              const bests = Object.entries(s.best ?? {}).sort((a, b) => a[1] - b[1]);
              return (
                <li key={s.id} className={s.id === sessionId ? "active" : ""}>
                  <button className="session-item" onClick={() => setSessionId(s.id)}>
                    <span className="session-date">{fmtDate(s.startedAt)}</span>
                    <span className="session-meta">
                      {s.laps} volta(s) • {minutes(s.startedAt, s.endedAt)} min
                    </span>
                    <span className="session-tracks">{Object.keys(s.tracks).join(", ")}</span>
                    {bests[0] && <span className="session-best">Melhor: {fmtTime(bests[0][1])}</span>}
                  </button>
                  <button className="link session-delete" title="Apagar esta sessão" onClick={() => deleteSession(s)}>
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="map-header">
          <h2>{lap ? `MAPA • VOLTA ${lapN} • ${fmtTime(lap.ms)}${lap.partial ? " (PARCIAL)" : ""}` : "MAPA"}</h2>
          {lap && (segments || spins) && <LapColorToggle mode={lapColorMode} onChange={setLapColorMode} />}
        </div>
        {lap ? (
          <>
            <TrackMap
              map={{
                start: lap.track?.start ?? lap.path[0],
                finish: lap.track?.finish ?? null,
                refPath: lap.refPath,
                sectors: lap.track?.sectors ?? null,
                corners: lap.corners,
                mapVersion: lap.id,
              }}
              lap={lap}
              miniColors={segments?.colors}
              lapColorMode={lapColorMode}
              showCorners={settings.showCorners}
              selectedCorner={corner}
              onCornerClick={analysis ? setCorner : undefined}
              focus={cornerFocus}
              spinRanges={spins}
            />
            <SegmentStrip segments={segments} label={`Volta ${lapN}${lap.partial ? " (parcial)" : ""}`} />
            {settings.compareChart && <CompareChart lap={lap} label={`Volta ${lapN}`} />}
            {losses && <LapAnalysis title={`ONDE PERDESTE TEMPO • VOLTA ${lapN}`} items={losses} />}
            {settings.showCorners && <CornerTable analysis={analysis} selected={corner} onSelect={setCorner} />}
          </>
        ) : (
          <p className="hint">Escolhe uma volta na lista à direita para ver o mapa, os trechos e a comparação.</p>
        )}
      </section>

      <section className="panel side">
        {groups.length > 1 && (
          <div className="car-select">
            <select value={activeGroup} onChange={(e) => setGroup(e.target.value)}>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {groupLabel(g)}
                </option>
              ))}
            </select>
          </div>
        )}
        {groups.length === 1 && <p className="car">{groupLabel(activeGroup)}</p>}
        {laps.length > 0 && <LapHistory laps={laps} selected={lapId} onSelect={selectLap} onDelete={deleteLap} />}
        {laps.length > 0 && (
          <ExportPanel
            source="archive"
            query={{ sessionId, trackName: trackName === NO_TRACK ? null : trackName }}
            carKey={carKey}
            carName={carLabel(carKey, carNames)}
            settings={settings}
            lapsExport={lapsExport}
            send={send}
          />
        )}
      </section>
    </div>
  );
}
