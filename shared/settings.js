// Definições partilhadas entre o servidor e a interface. Cada funcionalidade opcional
// tem aqui o seu interruptor e valor por defeito.
export const DEFAULT_SETTINGS = {
  showPedals: true,
  showLapHistory: true,
};

// Junta valores guardados com os por defeito, ignorando chaves desconhecidas ou de tipo errado.
export function mergeSettings(saved) {
  const out = { ...DEFAULT_SETTINGS };
  for (const [key, value] of Object.entries(saved ?? {})) {
    if (key in DEFAULT_SETTINGS && typeof value === typeof DEFAULT_SETTINGS[key]) out[key] = value;
  }
  return out;
}
