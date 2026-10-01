// Alterna as cores do traçado de uma volta no mapa: setores (S1/S2/S3) ou mini-setores.
export default function LapColorToggle({ mode, onChange }) {
  return (
    <div className="segmented" role="group" aria-label="Cores do traçado">
      <button className={mode === "sectors" ? "active" : ""} onClick={() => onChange("sectors")}>
        Setores
      </button>
      <button className={mode === "mini" ? "active" : ""} onClick={() => onChange("mini")}>
        Mini-setores
      </button>
    </div>
  );
}
