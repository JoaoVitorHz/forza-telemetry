// Nomes dos carros dados pelo utilizador (o jogo só envia o ID): data/cars.json = { [id]: nome }
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE = process.env.CARS_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "cars.json");

export class CarStore {
  constructor() {
    this.names = {};
    try {
      this.names = JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch (err) {
      if (err.code !== "ENOENT") console.error("[carros] erro a ler cars.json:", err.message);
    }
  }

  setName(id, name) {
    const clean = String(name ?? "").trim().slice(0, 60);
    if (clean) this.names[id] = clean;
    else delete this.names[id];
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(this.names, null, 2));
  }
}
