import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readSettings } from "./server/settingsStore.js";

export default defineConfig({
  plugins: [react()],
  // Acesso de outros dispositivos da rede (telemóvel/tablet) só se ativado nas Configurações.
  server: { host: readSettings().lanAccess ? true : "localhost" },
});
