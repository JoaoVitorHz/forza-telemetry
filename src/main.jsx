import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Overlay from "./Overlay.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {new URLSearchParams(location.search).has("overlay") ? (
      <Overlay kind={new URLSearchParams(location.search).get("overlay")} />
    ) : (
      <App />
    )}
  </StrictMode>,
);
