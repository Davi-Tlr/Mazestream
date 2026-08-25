// Lightweight LiveKit data-channel protocol for pointers, drawings, reactions,
// the shared board and "look here" invitations. Nothing here becomes media.

export const INTERACTION_TOPIC = "maze";

export function encodeInteraction(value) {
  return new TextEncoder().encode(JSON.stringify(value));
}

export function decodeInteraction(payload) {
  try { return JSON.parse(new TextDecoder().decode(payload)); }
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

export const DRAW_COLORS = ["#ffffff", "#111111", "#e0342a", "#f0b429", "#37b26a", "#3b82f6"];
export const DRAW_WIDTHS = [2, 5, 11];
export const INTERACTION_LIFETIME = { ping: 4200, stroke: 6000, reaction: 3600, cursor: 1400 };
export const MARKER_STYLES = ["ring", "arrow", "1", "2", "3"];

export const REACTION_TO_WIRE = { heart: "coracao", flame: "chama", bolt: "raio", star: "estrela" };
export const REACTION_FROM_WIRE = { coracao: "heart", chama: "flame", raio: "bolt", estrela: "star" };

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

export function sanitizePoints(points, max = 300) {
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
  return DRAW_COLORS.includes(color) ? color : DRAW_COLORS[0];
}

export function sanitizeWidth(width) {
  return DRAW_WIDTHS.includes(width) ? width : DRAW_WIDTHS[1];
}
