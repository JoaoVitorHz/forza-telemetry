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

// Divide um traçado em colors.length troços de igual comprimento (troço sem cor = null).
function segmentsByDistance(path, colors) {
  if (!path?.length || !colors?.length) return [];
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  }
  const total = cum[cum.length - 1];
  const segments = [];
  let i = 0;
  colors.forEach((color, k) => {
    const end = ((k + 1) * total) / colors.length;
    const pts = [path[i]];
    while (i < path.length - 1 && cum[i + 1] <= end) pts.push(path[++i]);
    if (color && pts.length > 1) segments.push({ pts, color: SECTOR_COLORS[color] });
  });
  return segments;
}

// Desenha o traçado da melhor volta (ou o rasto da volta atual enquanto não há nenhuma),
// a linha de partida e a posição do carro. Com `lap`, mostra essa volta colorida por setor.
// miniColors: mini-setores (ao vivo pintam o traçado de referência; com `lap` e
// lapColorMode = "mini" pintam o traçado da volta em vez dos setores).
export default function TrackMap({ map, pos, lapNumber, lap, ghost, miniColors, lapColorMode = "sectors" }) {
  const canvasRef = useRef(null);
  const trailRef = useRef([]);

  useEffect(() => {
    trailRef.current = [];
  }, [lapNumber, map?.mapVersion]);

  useEffect(() => {
    if (pos) {
      const last = trailRef.current[trailRef.current.length - 1];
      const jump = last ? Math.hypot(pos.x - last.x, pos.z - last.z) : 0;
      // Salto grande (retroceder, teleporte): recomeça o rasto em vez de traçar uma reta.
      if (jump > 50) trailRef.current = [];
      if (!last || jump > 2) trailRef.current.push({ x: pos.x, z: pos.z });
    }
    const trail = trailRef.current;

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
      if (lapColorMode === "mini" && miniColors) {
        line(lap.path, NO_SECTOR, 5);
        for (const seg of segmentsByDistance(lap.path, miniColors)) line(seg.pts, seg.color, 5);
      } else {
        for (const seg of sectorSegments(lap)) line(seg.pts, seg.color, 5);
      }
    } else {
      line(ref, "#555", 9);
      line(ref, "#bbb", 5);
      for (const seg of segmentsByDistance(ref, miniColors)) line(seg.pts, seg.color, 5);
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
  }, [map, pos, lapNumber, lap, ghost, miniColors, lapColorMode]);

  return <canvas ref={canvasRef} width={W} height={H} className="map" />;
}
