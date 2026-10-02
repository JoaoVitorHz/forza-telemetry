// Ponto de um traçado a uma fração (0–1) do seu comprimento.
export function pointAlongPath(path, frac) {
  if (!path?.length) return null;
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  }
  const d = Math.max(0, Math.min(1, frac)) * cum[cum.length - 1];
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  const a = path[i - 1];
  const b = path[i] ?? a;
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
}
