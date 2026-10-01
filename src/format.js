export function fmtTime(ms) {
  if (ms == null) return "--:--.---";
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
  return `${m}:${s}`;
}

export function fmtDelta(ms) {
  if (ms == null) return "--.---";
  return `${ms < 0 ? "-" : "+"}${(Math.abs(ms) / 1000).toFixed(3)}`;
}
