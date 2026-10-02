import { useEffect, useRef, useState } from "react";
import { buildReport } from "./exportReport.js";

const BIG_KB = 80; // acima disto é melhor enviar o ficheiro do que colar no chat

// "Exportar para análise": escolhe quantas voltas (últimas N ou todas), gera o relatório em texto
// e permite copiá-lo ou descarregá-lo.
export default function ExportPanel({ source, trackId, carKey, carName, settings, lapsExport, send }) {
  const [count, setCount] = useState(10);
  const [all, setAll] = useState(false);
  const [includeTelemetry, setIncludeTelemetry] = useState(true);
  const [stepM, setStepM] = useState(25);
  const [report, setReport] = useState(null);
  const [copied, setCopied] = useState(false);
  const pending = useRef(null);

  useEffect(() => {
    if (!lapsExport || lapsExport.requestId !== pending.current) return;
    pending.current = null;
    const data = lapsExport.data;
    if (!data?.laps?.length) {
      setReport({ error: "Não há voltas deste carro para exportar." });
      return;
    }
    const text = buildReport(data, { carName, spinThreshold: settings.tractionSensitivity, stepM, includeTelemetry });
    setReport({ text, laps: data.laps.length, kb: Math.round(new Blob([text]).size / 1024) });
  }, [lapsExport, carName, settings.tractionSensitivity, stepM, includeTelemetry]);

  const generate = () => {
    const requestId = `${Date.now()}`;
    pending.current = requestId;
    setReport({ loading: true });
    setCopied(false);
    send({ type: "exportLaps", requestId, source, trackId, carKey, count: all ? 0 : count });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report.text);
      setCopied(true);
    } catch {
      alert("Não foi possível copiar. Use o botão Baixar.");
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([report.text], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `analise-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="export">
      <h2>EXPORTAR PARA ANÁLISE</h2>
      <div className="export-options">
        <label>
          Últimas{" "}
          <input
            type="number"
            min={1}
            max={500}
            value={count}
            disabled={all}
            onChange={(e) => setCount(Math.max(1, Math.round(Number(e.target.value)) || 1))}
          />{" "}
          voltas
        </label>
        <label>
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Todas
        </label>
        <label>
          <input type="checkbox" checked={includeTelemetry} onChange={(e) => setIncludeTelemetry(e.target.checked)} /> Telemetria
          detalhada a cada{" "}
          <select value={stepM} disabled={!includeTelemetry} onChange={(e) => setStepM(Number(e.target.value))}>
            <option value={10}>10 m</option>
            <option value={25}>25 m</option>
            <option value={50}>50 m</option>
          </select>
        </label>
      </div>
      <button onClick={generate}>Gerar relatório</button>

      {report?.loading && <p className="hint">A gerar…</p>}
      {report?.error && <p className="hint">{report.error}</p>}
      {report?.text && (
        <div className="export-result">
          <p className="hint">
            Relatório com {report.laps} volta(s), {report.kb} KB.{" "}
            {report.kb > BIG_KB
              ? "É grande para colar no chat: use Baixar e envie o arquivo (ou desligue a telemetria / use 50 m)."
              : "Copie e cole no chat, ou baixe o arquivo."}
          </p>
          <div className="buttons">
            <button onClick={copy}>{copied ? "✓ Copiado" : "📋 Copiar"}</button>
            <button onClick={download}>⇩ Baixar</button>
          </div>
        </div>
      )}
    </div>
  );
}
