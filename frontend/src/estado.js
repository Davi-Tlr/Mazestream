// Estado da live viaja na metadata do participante (JSON). Persiste pra quem
// entra no meio e nao custa nada no servidor. Formato: { v, titulo, estado, desde }.
export function lerEstado(p) {
  let m = null;
  try { m = p && p.metadata ? JSON.parse(p.metadata) : null; } catch (e) {}
  if (!m || typeof m !== "object") m = {};
  return {
    titulo: typeof m.titulo === "string" ? m.titulo.slice(0, 80) : "",
    estado: m.estado === "pausado" ? "pausado" : (m.estado === "ao_vivo" ? "ao_vivo" : "off"),
    desde: typeof m.desde === "number" && m.desde > 0 ? m.desde : 0
  };
}

export function montarEstado(e) {
  return JSON.stringify({
    v: 1,
    titulo: (e.titulo || "").slice(0, 80),
    estado: e.estado || "off",
    desde: e.desde || 0
  });
}

// ms -> "m:ss" (ou "h:mm:ss" quando passa de 1h)
export function fmtDuracao(ms) {
  if (!ms || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), seg = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return (h > 0 ? h + ":" : "") + mm + ":" + String(seg).padStart(2, "0");
}
