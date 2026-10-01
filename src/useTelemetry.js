import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS } from "../shared/settings.js";

// Liga ao servidor Node por WebSocket e volta a ligar automaticamente se cair.
export function useTelemetry(url) {
  const [state, setState] = useState(null);
  const [map, setMap] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [lapDetail, setLapDetail] = useState(null);
  const [trackView, setTrackView] = useState(null);
  const [savedLap, setSavedLap] = useState(null);
  const [carNames, setCarNames] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [network, setNetwork] = useState(null);
  const [online, setOnline] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    let ws;
    let retry;
    let closed = false;

    const connect = () => {
      ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => setOnline(true);
      ws.onclose = () => {
        setOnline(false);
        if (!closed) retry = setTimeout(connect, 1000);
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "state") setState(msg);
        else if (msg.type === "map") setMap(msg);
        else if (msg.type === "tracks") setTracks(msg.tracks);
        else if (msg.type === "lap") setLapDetail(msg.lap);
        else if (msg.type === "trackView") setTrackView(msg.view);
        else if (msg.type === "savedLap") setSavedLap(msg.lap);
        else if (msg.type === "cars") setCarNames(msg.names);
        else if (msg.type === "settings") setSettings(msg.values);
        else if (msg.type === "network") setNetwork(msg);
        else if (msg.type === "trackExport") downloadJson(msg.fileName, msg.data);
        else if (msg.type === "importResult")
          alert(msg.ok ? `Pista importada: ${msg.name}` : `Não foi possível importar: ${msg.error}`);
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      ws.close();
    };
  }, [url]);

  const send = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  return { state, map, tracks, lapDetail, trackView, savedLap, carNames, settings, network, online, send };
}

function downloadJson(fileName, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
