import React from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider, App as AntApp } from "antd";
import ptBR from "antd/locale/pt_BR";
import { criarTema } from "./theme.js";
import { TemaProvider, useTema } from "./tema.jsx";
import App from "./App.jsx";
import "./styles.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  });
}

// Le o tema efetivo e monta o ConfigProvider do antd no algoritmo certo.
function Raiz() {
  const { escuro } = useTema();
  return (
    <ConfigProvider theme={criarTema(escuro)} locale={ptBR}>
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <TemaProvider>
      <Raiz />
    </TemaProvider>
  </React.StrictMode>
);
