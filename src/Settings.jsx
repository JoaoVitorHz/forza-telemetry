import { SETTINGS_GROUPS } from "./settingsSchema.js";

// Aba Configurações: ativa/desativa cada funcionalidade. Grava no servidor ao mudar.
export default function Settings({ settings, network, send }) {
  const set = (key, value) => send({ type: "setSettings", patch: { [key]: value } });

  return (
    <div className="settings">
      {SETTINGS_GROUPS.map((group) => (
        <section key={group.title} className="panel">
          <h2>{group.title.toUpperCase()}</h2>
          {group.items.map((item) => (
            <div key={item.key} className="setting">
              <div className="setting-text">
                <span className="setting-label">
                  {item.label}
                  {item.restart && <span className="setting-tag">requer reiniciar</span>}
                </span>
                {item.desc && <span className="setting-desc">{item.desc}</span>}
                {item.key === "lanAccess" && <LanInfo settings={settings} network={network} />}
              </div>
              {item.type === "bool" ? (
                <label className="switch">
                  <input type="checkbox" checked={!!settings[item.key]} onChange={(e) => set(item.key, e.target.checked)} />
                  <span />
                </label>
              ) : (
                <input
                  type="number"
                  className="setting-number"
                  min={item.min}
                  max={item.max}
                  value={settings[item.key]}
                  onChange={(e) => {
                    const v = Math.round(Number(e.target.value));
                    if (Number.isFinite(v)) set(item.key, Math.min(item.max, Math.max(item.min, v)));
                  }}
                />
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function LanInfo({ settings, network }) {
  if (!network) return null;
  if (settings.lanAccess !== network.lanActive) {
    return <span className="setting-warn">Reinicia o npm run dev para aplicar.</span>;
  }
  if (!network.lanActive) return null;
  return (
    <span className="setting-desc">
      Abre no telemóvel:{" "}
      {network.urls.map((url) => (
        <code key={url} className="lan-url">
          {url}
        </code>
      ))}
    </span>
  );
}
