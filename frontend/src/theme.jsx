import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

const ThemeContext = createContext(null);

function readPref() {
  try {
    const p = localStorage.getItem("tema");
    if (p === "auto" || p === "claro" || p === "escuro") return p;
  } catch (e) {}
  return "auto";
}

function systemDark() {
  try {
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  } catch (e) {
    return false;
  }
}

function resolve(pref, sysDark) {
  if (pref === "escuro") return "dark";
  if (pref === "claro") return "light";
  return sysDark ? "dark" : "light";
}

export function ThemeProvider({ children }) {
  const [pref, setPref] = useState(readPref);
  const [sysDark, setSysDark] = useState(systemDark);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setSysDark(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, []);

  const effective = resolve(pref, sysDark);

  useEffect(() => {
    const mode = effective === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", mode);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", effective === "dark" ? "#0d0e11" : "#f4f3f0");
    try { localStorage.setItem("tema", pref); } catch (e) {}
  }, [effective, pref]);

  const setPrefFn = useCallback((p) => setPref(p), []);
  const toggle = useCallback(() => {
    setPref(effective === "dark" ? "claro" : "escuro");
  }, [effective]);

  const value = useMemo(
    () => ({ pref, effective, dark: effective === "dark", setPref: setPrefFn, toggle }),
    [pref, effective, setPrefFn, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be inside <ThemeProvider>");
  return ctx;
}
