import { useState } from "react";
import { fmtTime } from "./format.js";

// Guardar a pista atual e gerir as pistas guardadas.
export default function Tracks({ tracks, timer, settings, send }) {
  const [name, setName] = useState("");
  const canSave = timer?.start && !timer.track;

  const save = (e) => {
    e.preventDefault();
    send({ type: "saveTrack", name });
    setName("");
  };

  const exportTrack = (track) => send({ type: "exportTrack", id: track.id, includeLaps: settings.exportIncludeLaps });

  // Lê o ficheiro escolhido e envia-o ao servidor, que cria uma pista nova.
  const importFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      send({ type: "importTrack", data: JSON.parse(await file.text()) });
    } catch {
      alert("Este ficheiro não é um JSON válido.");
    }
  };

  const remove = (track) => {
    if (confirm(`Apagar a pista "${track.name}" e o seu recorde?`)) send({ type: "deleteTrack", id: track.id });
  };

  return (
    <div className="tracks">
      <h2>PISTAS</h2>

      {canSave && (
        <form className="save" onSubmit={save}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da pista" maxLength={60} />
          <button type="submit">Guardar pista</button>
        </form>
      )}

      {tracks.length === 0 ? (
        <p className="hint">
          Nenhuma pista guardada. Define a partida, dá uma volta e guarda — da próxima vez a pista é detetada
          sozinha quando passares na partida.
        </p>
      ) : (
        <ul>
          {tracks.map((tr) => (
            <li key={tr.id} className={tr.id === timer?.track?.id ? "active" : ""}>
              <span className="name">{tr.name}</span>
              <span className="record">{fmtTime(tr.recordMs)}</span>
              <button onClick={() => send({ type: "loadTrack", id: tr.id })} title="Usar esta pista">
                Usar
              </button>
              {settings.exportImport && (
                <button onClick={() => exportTrack(tr)} title="Exportar para ficheiro">
                  ⇩
                </button>
              )}
              <button onClick={() => remove(tr)} title="Apagar">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {settings.exportImport && (
        <label className="import">
          <input type="file" accept=".json,application/json" onChange={importFile} />
          <span>Importar pista…</span>
        </label>
      )}
    </div>
  );
}
