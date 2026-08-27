// Lightweight LiveKit data-channel protocol for pointers, drawings, reactions,
// the shared board and "look here" invitations. Nothing here becomes media.

export const INTERACTION_TOPIC = "maze";

export function encodeInteraction(value) {
  return new TextEncoder().encode(JSON.stringify(value));
}

export function encodeInteractionForTransport(value, targetBytes = 12 * 1024) {
  let encoded = encodeInteraction(value);
  if (encoded.byteLength <= targetBytes) return encoded;

  // Old clients used `pts`; current clients accept `points` and `pts`. Keep the
  // alias for ordinary strokes, but remove the duplicate array when a long
  // stroke would otherwise exceed LiveKit's practical data-packet budget.
  if (value && Array.isArray(value.points) && Array.isArray(value.pts)) {
    const compact = { ...value };
    delete compact.pts;
    encoded = encodeInteraction(compact);
  }
  return encoded;
}

export function decodeInteraction(payload) {
  try {
    if (!payload || Number(payload.byteLength || payload.length || 0) > 64 * 1024) return null;
    return JSON.parse(new TextDecoder().decode(payload));
  }
  catch (e) { return null; }
}

export function getVideoContentArea(video) {
  if (!video) return null;
  const vw = video.videoWidth, vh = video.videoHeight;
  const cw = video.clientWidth, ch = video.clientHeight;
  if (!vw || !vh || !cw || !ch) return null;
  const scale = Math.min(cw / vw, ch / vh);
  const width = vw * scale, height = vh * scale;
  return {
    left: (cw - width) / 2,
    top: (ch - height) / 2,
    width,
    height
  };
}

export function toNormalizedVideoPoint(video, clientX, clientY) {
  const area = getVideoContentArea(video);
  if (!area) return null;
  const rect = video.getBoundingClientRect();
  const x = (clientX - rect.left - area.left) / area.width;
  const y = (clientY - rect.top - area.top) / area.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

export const DRAW_COLORS = [
  "#ffffff", "#111111", "#ef4444", "#f97316", "#facc15",
  "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"
];
export const DRAW_WIDTHS = [2, 4, 7, 12, 20];
export const DRAW_TOOLS = ["pen", "marker", "line", "arrow", "rectangle", "ellipse", "eraser"];
export const DRAW_TOOL_LABELS = {
  pen: "Caneta",
  marker: "Marca-texto",
  line: "Linha",
  arrow: "Seta",
  rectangle: "Retângulo",
  ellipse: "Elipse",
  eraser: "Borracha"
};
export const STREAM_DRAWING_TTL_MS = 10000;
export const INTERACTION_LIFETIME = { ping: 4200, stroke: STREAM_DRAWING_TTL_MS, reaction: 4800, cursor: 1400 };
export const MARKER_STYLES = ["ring", "arrow", "1", "2", "3"];

export const REACTION_EMOJIS = {
  heart: "❤️",
  laugh: "😂",
  wow: "😮",
  fire: "🔥",
  clap: "👏",
  thumbsUp: "👍",
  party: "🎉",
  skull: "💀"
};
export const REACTION_TO_WIRE = {
  heart: "coracao", laugh: "risada", wow: "uau", fire: "chama",
  clap: "palmas", thumbsUp: "joinha", party: "festa", skull: "caveira"
};
export const REACTION_FROM_WIRE = {
  coracao: "heart", risada: "laugh", uau: "wow", chama: "fire",
  palmas: "clap", joinha: "thumbsUp", festa: "party", caveira: "skull",
  flame: "fire", bolt: "wow", star: "party", raio: "wow", estrela: "party"
};

export const LEGACY_TYPE_MAP = {
  ping: "ping",
  risco: "stroke",
  reacao: "reaction",
  "q-risco": "board-stroke",
  "q-apagar": "board-erase",
  "q-limpar": "board-clear",
  olha: "look"
};

export function newInteractionId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function sanitizePoints(points, max = 600) {
  if (!Array.isArray(points)) return [];
  return points.slice(0, max).map((point) => {
    if (!Array.isArray(point) || point.length < 2) return null;
    const x = Number(point[0]), y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return [
      Math.max(0, Math.min(1, Math.round(x * 10000) / 10000)),
      Math.max(0, Math.min(1, Math.round(y * 10000) / 10000))
    ];
  }).filter(Boolean);
}

export function sanitizeColor(color) {
  const value = String(color || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(value) ? value : DRAW_COLORS[0];
}

export function sanitizeWidth(width) {
  return DRAW_WIDTHS.includes(width) ? width : DRAW_WIDTHS[1];
}

export function sanitizeDrawTool(tool) {
  return DRAW_TOOLS.includes(tool) ? tool : "pen";
}

export function sanitizeOpacity(opacity, tool = "pen") {
  const fallback = tool === "marker" ? 0.32 : 1;
  const value = Number(opacity);
  return Number.isFinite(value) ? Math.max(0.12, Math.min(1, value)) : fallback;
}

export function sanitizeDrawAction(value) {
  const tool = sanitizeDrawTool(value && value.tool);
  return {
    id: String((value && value.id) || newInteractionId()).slice(0, 80),
    points: sanitizePoints(value && (value.points || value.pts)),
    color: sanitizeColor(value && (value.color || value.cor)),
    width: sanitizeWidth(Number(value && (value.width ?? value.espessura))),
    tool,
    opacity: sanitizeOpacity(value && value.opacity, tool)
  };
}
