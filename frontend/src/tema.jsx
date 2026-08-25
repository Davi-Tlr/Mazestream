import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

// Preferencia de tema: "auto" segue o sistema, "claro"/"escuro" fixam a escolha.
// A escolha fica salva; "auto" reage ao vivo quando o SO troca de tema.
const TemaContext = createContext(null);

function lerPref() {
  try {
    const p = localStorage.getItem("tema");
    if (p === "auto" || p === "claro" || p === "escuro") return p;
  } catch (e) {}
  return "auto";
}

function sistemaEscuro() {
  try {
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  } catch (e) {
    return false;
  }
}

function resolver(pref, sisEscuro) {
  if (pref === "escuro") return "escuro";
  if (pref === "claro") return "claro";
  return sisEscuro ? "escuro" : "claro";
}

export function TemaProvider({ children }) {
  const [pref, setPref] = useState(lerPref);
  const [sisEscuro, setSisEscuro] = useState(sistemaEscuro);

  // Acompanha o tema do SO enquanto a preferencia for "auto".
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onMuda = (e) => setSisEscuro(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", onMuda);
    else if (mq.addListener) mq.addListener(onMuda);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onMuda);
      else if (mq.removeListener) mq.removeListener(onMuda);
    };
  }, []);

  const efetivo = resolver(pref, sisEscuro);

  // Aplica no documento (atributo + cor da barra do navegador) e salva a escolha.
  useEffect(() => {
    const modo = efetivo === "escuro" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", modo);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", efetivo === "escuro" ? "#0d0e11" : "#f4f3f0");
    try { localStorage.setItem("tema", pref); } catch (e) {}
  }, [efetivo, pref]);

  const definir = useCallback((p) => setPref(p), []);
  const alternar = useCallback(() => {
    // Botao rapido: fixa o oposto do que esta valendo agora.
    setPref(efetivo === "escuro" ? "claro" : "escuro");
  }, [efetivo]);

  const valor = useMemo(
    () => ({ pref, efetivo, escuro: efetivo === "escuro", definir, alternar }),
    [pref, efetivo, definir, alternar]
  );

  return <TemaContext.Provider value={valor}>{children}</TemaContext.Provider>;
}

export function useTema() {
  const ctx = useContext(TemaContext);
  if (!ctx) throw new Error("useTema precisa estar dentro de <TemaProvider>");
  return ctx;
}
