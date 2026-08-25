export const SEND_PRESETS = {
  high:   { w: 1920, h: 1080, fps: 60, br: 5000000, label: "Alta · 1080p 60fps" },
  medium: { w: 1280, h: 720,  fps: 30, br: 2200000, label: "Media · 720p 30fps" },
  low:    { w: 960,  h: 540,  fps: 30, br: 1000000, label: "Baixa · 540p 30fps" }
};

export const SEND_OPTIONS = [
  { value: "high",   label: "Alta · 1080p 60fps" },
  { value: "medium", label: "Media · 720p 30fps" },
  { value: "low",    label: "Baixa · 540p 30fps" }
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
