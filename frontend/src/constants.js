import { APP_PROFILE } from "./appProfile.js";

function mbpsLabel(bitrate) {
  return (bitrate / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " Mbps";
}

export const SEND_PRESETS = {
  high:   { w: 1920, h: 1080, fps: 30, br: APP_PROFILE.screenBitrates.high, label: "1080p30" },
  medium: { w: 1280, h: 720,  fps: 30, br: APP_PROFILE.screenBitrates.medium, label: "720p30" },
  low:    { w: 960,  h: 540,  fps: 30, br: APP_PROFILE.screenBitrates.low, label: "540p30" }
};

export const SEND_OPTIONS = Object.entries(SEND_PRESETS).map(([value, preset]) => ({
  value,
  label: preset.label + " · até " + mbpsLabel(preset.br)
}));

export const CONTENT_OPTIONS = [
  { value: "motion", label: "Movimento · jogos e vídeo" },
  { value: "detail", label: "Detalhes · texto e código" }
];

export const RECEIVE_OPTIONS = [
  { value: "auto",   label: "Automática" },
  { value: "high",   label: "Alta" },
  { value: "medium", label: "Média" },
  { value: "low",    label: "Baixa" }
];

export const MAX_SCREENS = 2;

export const DEFAULT_SETTINGS = {
  configVersion: 4,
  audioOnShare: true,
  sendQuality: "high",
  shareContent: "motion",
  receiveQuality: "auto",
  muteAll: false,
  startMuted: true,
  interactionsEnabled: true,
  pointersEnabled: true
};

export const QUALITY_LABELS = {
  excellent: "Excelente",
  good: "Boa",
  poor: "Ruim",
  lost: "Caiu",
  unknown: "..."
};
