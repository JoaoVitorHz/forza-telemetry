import { useEffect, useRef } from "react";

const W = 600;
const H = 500;
const PAD = 30;

// Desenha o traçado da melhor volta (ou o rasto da volta atual enquanto não há nenhuma),
// a linha de partida e a posição do carro.
export default function TrackMap({ map, pos, lapNumber }) {
  const canvasRef = useRef(null);
  const trailRef = useRef([]);

  useEffect(() => {
    trailRef.current = [];
  }, [lapNumber, map?.mapVersion]);

  useEffect(() => {
    const trail = trailRef.current;
    if (pos) {
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(pos.x - last.x, pos.z - last.z) > 2) trail.push({ x: pos.x, z: pos.z });
    }

    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, W, H);

    const ref = map?.refPath ?? [];
    const all = [...ref, ...trail, ...(map?.start ? [map.start] : []), ...(pos ? [pos] : [])];
    if (all.length < 2) {
      ctx.fillStyle = "#666";
      ctx.font = "16px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Conduz para desenhar o mapa", W / 2, H / 2);
      return;
    }

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of all) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const s = Math.min((W - 2 * PAD) / (maxX - minX || 1), (H - 2 * PAD) / (maxZ - minZ || 1));
    const ox = (W - (maxX - minX) * s) / 2;
    const oy = (H - (maxZ - minZ) * s) / 2;
    // Z invertido para o norte ficar para cima
    const proj = (p) => [ox + (p.x - minX) * s, oy + (maxZ - p.z) * s];

    const line = (pts, color, width) => {
      if (pts.length < 2) return;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(...proj(p)) : ctx.moveTo(...proj(p))));
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = ctx.lineCap = "round";
      ctx.stroke();
    };
    const dot = (p, color, r) => {
      ctx.beginPath();
      ctx.arc(...proj(p), r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    };

    line(ref, "#555", 9);
    line(ref, "#bbb", 5);
    line(trail, "#4da3ff", 2);
    if (map?.start) {
      dot(map.start, "#2ecc71", 7);
      const [sx, sy] = proj(map.start);
      ctx.fillStyle = "#2ecc71";
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "left";
      ctx.fillText("START", sx + 10, sy + 4);
    }
    if (pos) dot(pos, "#fff", 6);
  }, [map, pos, lapNumber]);

  return <canvas ref={canvasRef} width={W} height={H} className="map" />;
}
