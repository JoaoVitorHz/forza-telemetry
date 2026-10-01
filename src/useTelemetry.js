import { useCallback, useEffect, useRef, useState } from "react";

// Liga ao servidor Node por WebSocket e volta a ligar automaticamente se cair.
export function useTelemetry(url) {
  const [state, setState] = useState(null);
  const [map, setMap] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [lapDetail, setLapDetail] = useState(null);
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

  return { state, map, tracks, lapDetail, online, send };
}
