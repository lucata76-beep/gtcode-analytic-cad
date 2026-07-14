import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AnalyticCad from "./analytic-cad";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AnalyticCad />
  </StrictMode>,
);
