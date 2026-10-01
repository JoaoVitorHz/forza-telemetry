import { useEffect, useRef } from "react";

const W = 600;
const H = 500;
const PAD = 30;
const SECTOR_COLORS = { purple: "#b57bff", green: "#2ecc71", yellow: "#f1c40f" };
const NO_SECTOR = "#888";

// Divide o traçado de uma volta nos três setores, cada um com a sua cor.
function sectorSegments(lap) {
  const { path, splitIdx = [], splits = [] } = lap;
  const bounds = [0, splitIdx[0], splitIdx[1], path.length - 1];
  const segments = [];
  let from = 0;
  for (let i = 0; i < 3; i++) {
    const to = i === 2 ? bounds[3] : bounds[i + 1];
    if (to == null) break; // setor não medido: o resto fica a cinzento
    segments.push({ pts: path.slice(from, to + 1), color: SECTOR_COLORS[splits[i]?.color] ?? NO_SECTOR });
    from = to;
  }
  if (from < path.length - 1) segments.push({ pts: path.slice(from), color: NO_SECTOR });
  return segments;
}

// Desenha o traçado da melhor volta (ou o rasto da volta atual enquanto não há nenhuma),
// a linha de partida e a posição do carro. Com `lap`, mostra essa volta colorida por setor.
export default function TrackMap({ map, pos, lapNumber, lap, ghost }) {
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
    const lapPath = lap?.path ?? [];
    const all = lap
      ? [...ref, ...lapPath]
      : [...ref, ...trail, ...(map?.start ? [map.start] : []), ...(pos ? [pos] : [])];
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

    if (lap) {
      line(ref, "#2a2a2a", 9);
      for (const seg of sectorSegments(lap)) line(seg.pts, seg.color, 5);
    } else {
      line(ref, "#555", 9);
      line(ref, "#bbb", 5);
      line(trail, "#4da3ff", 2);
    }
    map?.sectors?.forEach((s, i) => {
      dot(s, "#f39c12", 5);
      const [x, y] = proj(s);
      ctx.fillStyle = "#f39c12";
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(`S${i + 1}`, x + 8, y + 4);
    });
    if (map?.start) {
      dot(map.start, "#2ecc71", 7);
      const [sx, sy] = proj(map.start);
      ctx.fillStyle = "#2ecc71";
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "left";
      ctx.fillText("START", sx + 10, sy + 4);
    }
    if (ghost && !lap) {
      // Fantasma do recorde: ponto roxo com anel, e a distância até ele.
      dot(ghost, "#0d0d0d", 8);
      dot(ghost, "#b57bff", 6);
      const [gx, gy] = proj(ghost);
      ctx.fillStyle = "#b57bff";
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(`REC ${ghost.gapM > 0 ? "+" : ""}${ghost.gapM} m`, gx + 10, gy - 8);
    }
    if (pos && !lap) dot(pos, "#fff", 6);
  }, [map, pos, lapNumber, lap, ghost]);

  return <canvas ref={canvasRef} width={W} height={H} className="map" />;
}
