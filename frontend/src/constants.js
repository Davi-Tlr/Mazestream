export const SEND_PRESETS = {
  high:   { w: 1920, h: 1080, fps: 30, br: 4000000, label: "Alta · 1080p" },
  medium: { w: 1280, h: 720,  fps: 30, br: 1800000, label: "Media · 720p" },
  low:    { w: 960,  h: 540,  fps: 30, br: 850000,  label: "Baixa · 540p" }
};

export const SEND_OPTIONS = [
  { value: "high",   label: "Alta · 1080p" },
  { value: "medium", label: "Media · 720p" },
  { value: "low",    label: "Baixa · 540p" }
];

export const RECEIVE_OPTIONS = [
  { value: "auto",   label: "Automatica" },
  { value: "high",   label: "Alta" },
  { value: "medium", label: "Media" },
  { value: "low",    label: "Baixa" }
];

export const MAX_SCREENS = 2;

export const DEFAULT_SETTINGS = {
  configVersion: 2,
  audioOnShare: true,
  sendQuality: "medium",
  receiveQuality: "auto",
  muteAll: false,
  startMuted: true
};

export const QUALITY_LABELS = {
  excellent: "Excelente",
  good: "Boa",
  poor: "Ruim",
  lost: "Caiu",
  unknown: "..."
};
