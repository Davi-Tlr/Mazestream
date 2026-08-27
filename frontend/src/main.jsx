import React from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider, App as AntApp } from "antd";
import ptBR from "antd/locale/pt_BR";
import { createTheme } from "./theme.js";
import { ThemeProvider, useTheme } from "./theme.jsx";
import App from "./App.jsx";
import "./styles.css";
import "./interactions.css";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  });
}

function Root() {
  const { dark } = useTheme();
  return (
    <ConfigProvider theme={createTheme(dark)} locale={ptBR}>
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  </React.StrictMode>
);
