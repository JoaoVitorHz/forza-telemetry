// Definições do utilizador em data/settings.json (as mesmas no PC, telemóvel e overlay).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeSettings } from "../shared/settings.js";

const FILE = process.env.SETTINGS_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "settings.json");

export function readSettings() {
  try {
    return mergeSettings(JSON.parse(fs.readFileSync(FILE, "utf8")));
  } catch (err) {
    if (err.code !== "ENOENT") console.error("[definições] erro a ler settings.json:", err.message);
    return mergeSettings({});
  }
}

export class SettingsStore {
  constructor() {
    this.values = readSettings();
  }

  update(patch) {
    this.values = mergeSettings({ ...this.values, ...patch });
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(this.values, null, 2));
  }
}
