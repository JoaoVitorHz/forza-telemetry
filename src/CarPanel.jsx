// Painel do carro: luz de mudança, temperatura dos pneus e patinagem das rodas.
// Rodas pela ordem do jogo: frente-esq., frente-dir., trás-esq., trás-dir.

const WHEELS = ["FE", "FD", "TE", "TD"];
const LEDS = 10;

function tireState(c) {
  if (c < 60) return { cls: "cold", label: "frio" };
  if (c > 95) return { cls: "hot", label: "quente" };
  return { cls: "ideal", label: "ideal" };
}

// Diferença de ângulo de deriva entre a frente e a traseira (só a velocidade razoável).
function balance(t) {
  if (!t.slipAngle || t.speedKmh < 30) return null;
  const front = (Math.abs(t.slipAngle[0]) + Math.abs(t.slipAngle[1])) / 2;
  const rear = (Math.abs(t.slipAngle[2]) + Math.abs(t.slipAngle[3])) / 2;
  if (front - rear > 0.05) return { cls: "under", label: "Subviragem" };
  if (rear - front > 0.05) return { cls: "over", label: "Sobreviragem" };
  return null;
}

function ShiftLight({ rpm, maxRpm, at }) {
  const frac = maxRpm ? rpm / maxRpm : 0;
  const target = at / 100;
  const startAt = target - 0.25;
  const lit = Math.max(0, Math.min(LEDS, Math.ceil(((frac - startAt) / (target - startAt)) * LEDS)));
  const shift = frac >= target;
  return (
    <div className={`shift-light ${shift ? "flash" : ""}`} aria-label={shift ? "Trocar mudança" : undefined}>
      {Array.from({ length: LEDS }, (_, i) => (
        <span key={i} className={i < lit ? (i < 4 ? "on green" : i < 7 ? "on yellow" : "on red") : ""} />
      ))}
    </div>
  );
}

export default function CarPanel({ t, settings }) {
  if (!t) return null;
  const showTires = settings.tireTemps && t.tireTempC;
  const showSlip = settings.wheelSlip && t.combinedSlip;
  const bal = showSlip ? balance(t) : null;

  return (
    <div className="car-panel">
      {settings.shiftLight && <ShiftLight rpm={t.rpm} maxRpm={t.maxRpm} at={settings.shiftLightAt} />}
      {(showTires || showSlip) && (
        <div className="wheels">
          {WHEELS.map((name, i) => {
            const temp = showTires ? tireState(t.tireTempC[i]) : null;
            const slip = showSlip ? t.combinedSlip[i] : null;
            return (
              <div key={name} className={`wheel ${temp?.cls ?? ""}`}>
                <span className="wheel-name">{name}</span>
                {temp && (
                  <span className="wheel-temp" title={`Pneu ${temp.label}`}>
                    {t.tireTempC[i]}°C
                  </span>
                )}
                {slip != null && (
                  <div className={`slip ${slip > 1 ? "lost" : ""}`} title={`Patinagem ${slip.toFixed(2)}`}>
                    <div style={{ width: `${Math.min(100, (slip / 1.5) * 100)}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {bal && <p className={`balance ${bal.cls}`}>⚠ {bal.label}</p>}
    </div>
  );
}
