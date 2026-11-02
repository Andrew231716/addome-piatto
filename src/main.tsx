import React from "react";
import { createRoot } from "react-dom/client";
import HomePage from "../app/page";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Elemento principale dell'app non trovato.");
}

createRoot(root).render(
  <React.StrictMode>
    <HomePage />
  </React.StrictMode>,
);


if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline shell optional */
    });
  });
}
