import { useEffect, useRef } from "react";

// Avisos sonoros: voz em português (speechSynthesis) ou bips (Web Audio).
// Os browsers só tocam som depois de um clique na página.

const COLOR_WORDS = { purple: "roxo", green: "verde", yellow: "amarelo" };
const BEEPS = { purple: [1320, 1320], green: [880], yellow: [440] };

let audioCtx = null;

function beep(freqs) {
  audioCtx ??= new AudioContext();
  freqs.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const start = audioCtx.currentTime + i * 0.18;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + 0.16);
  });
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  u.voice = voices.find((v) => v.lang === "pt-PT") ?? voices.find((v) => v.lang.startsWith("pt")) ?? null;
  u.lang = u.voice?.lang ?? "pt-PT";
  u.rate = 1.15;
  speechSynthesis.speak(u);
}

const decimal = (v, digits) => v.toFixed(digits).replace(".", ",");

function spokenDelta(ms) {
  if (ms == null) return "";
  return `${ms < 0 ? "menos" : "mais"} ${decimal(Math.abs(ms) / 1000, 1)}`;
}

function spokenTime(ms) {
  const m = Math.floor(ms / 60000);
  const s = decimal((ms % 60000) / 1000, 1);
  return m > 0 ? `${m} minuto${m > 1 ? "s" : ""} e ${s}` : `${s} segundos`;
}

export function announce(settings, { text, color }) {
  if (settings.soundVoice) speak(text);
  else beep(BEEPS[color] ?? BEEPS.yellow);
}

export function testSound(settings) {
  announce(settings, { text: "Setor 1, roxo, menos 0,2", color: "purple" });
}

// Anuncia cada setor fechado e cada volta terminada (só quando o som está ligado).
export function useAnnouncer(timer, settings) {
  const prev = useRef(null); // null até ao primeiro estado (não anuncia o que já existia)

  useEffect(() => {
    if (!timer) return;
    const splits = timer.sectors?.current ?? [];
    const lastLap = timer.laps?.[timer.laps.length - 1] ?? null;
    const p = prev.current;
    if (p && settings.sound) {
      const sameLap = timer.lapNumber === p.lapNumber;
      if (lastLap && lastLap.n !== p.lastLapN) {
        const lap = lastLap;
        if (settings.soundLaps) {
          const record = lap.color === "purple" ? ", novo recorde" : "";
          announce(settings, { text: `Volta ${spokenTime(lap.ms)}${record}`, color: lap.color });
        }
      } else if (sameLap && settings.soundSectors) {
        for (let i = p.splits; i < splits.length; i++) {
          const s = splits[i];
          if (!s) continue;
          announce(settings, { text: `Setor ${i + 1}, ${COLOR_WORDS[s.color]}, ${spokenDelta(s.deltaMs)}`, color: s.color });
        }
      }
    }
    prev.current = { splits: splits.length, lastLapN: lastLap?.n ?? null, lapNumber: timer.lapNumber };
  }, [timer, settings]);
}
