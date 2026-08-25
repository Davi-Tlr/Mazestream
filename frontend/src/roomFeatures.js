export const ROOM_TOPIC = "maze-room";

export const ROOM_PRESETS = {
  livre: {
    label: "Livre",
    description: "Sala equilibrada, sem comportamento especial.",
    layout: "default"
  },
  jogo: {
    label: "Jogo",
    description: "Foco na transmissão principal e reações rápidas.",
    layout: "theater"
  },
  rpg: {
    label: "RPG",
    description: "Interações, quadro e apontamentos à mão.",
    layout: "default"
  },
  apresentacao: {
    label: "Apresentação",
    description: "Um apresentador pode conduzir o destaque de todos.",
    layout: "default"
  }
};

export const PRESET_OPTIONS = Object.entries(ROOM_PRESETS).map(([value, preset]) => ({
  value,
  label: preset.label
}));

export function encodeRoomData(value) {
  return new TextEncoder().encode(JSON.stringify(value));
}

export function decodeRoomData(payload) {
  try { return JSON.parse(new TextDecoder().decode(payload)); }
  catch (e) { return null; }
}

export function newRoomMessageId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function sanitizeChatText(value) {
  return String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, 600);
}

export function sanitizeFileMeta(value) {
  const file = value && typeof value === "object" ? value : {};
  return {
    id: String(file.id || "").slice(0, 120),
    name: String(file.name || "arquivo").replace(/[\r\n\t]/g, " ").slice(0, 120),
    type: String(file.type || "application/octet-stream").slice(0, 100),
    size: Math.max(0, Math.min(20 * 1024 * 1024, Number(file.size) || 0)),
    url: typeof file.url === "string" && file.url.startsWith("/shared/") ? file.url.slice(0, 240) : ""
  };
}

export function normalizePresenter(value) {
  if (!value || typeof value !== "object") return null;
  if (value.kind === "board") return { kind: "board" };
  if (value.kind !== "track") return null;
  return {
    kind: "track",
    identity: String(value.identity || "").slice(0, 160),
    pubName: String(value.pubName || "").slice(0, 160),
    source: String(value.source || "").slice(0, 80)
  };
}

export function presenterMatchesTile(presenter, tile) {
  if (!presenter || presenter.kind !== "track" || !tile) return false;
  if (presenter.identity && presenter.identity !== tile.identity) return false;
  if (presenter.pubName && presenter.pubName !== tile.pubName) return false;
  if (presenter.source && String(tile.source) !== presenter.source) return false;
  return !!(presenter.identity || presenter.pubName);
}
