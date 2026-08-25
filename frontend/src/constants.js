// Presets de qualidade de envio (camada de topo de cada opcao).
export const PRESETS_ENVIO = {
  alta:  { w: 1920, h: 1080, fps: 30, br: 4000000, label: "Alta · 1080p" },
  media: { w: 1280, h: 720,  fps: 30, br: 1800000, label: "Média · 720p" },
  baixa: { w: 960,  h: 540,  fps: 30, br: 850000,  label: "Baixa · 540p" }
};

export const OPCOES_ENVIO = [
  { value: "alta", label: "Alta · 1080p" },
  { value: "media", label: "Média · 720p" },
  { value: "baixa", label: "Baixa · 540p" }
];

export const OPCOES_RECEBER = [
  { value: "auto", label: "Automática" },
  { value: "alta", label: "Alta" },
  { value: "media", label: "Média" },
  { value: "baixa", label: "Baixa" }
];

export const MAX_TELAS = 2;

export const AJUSTES_PADRAO = {
  configVersion: 2,
  audioAoCompartilhar: true,
  qualidadeEnvio: "media",
  qualidadeRecebo: "auto",
  silenciarTudo: false,
  iniciarMutado: true
};

export const QUALIDADE_PT = {
  excellent: "Excelente",
  good: "Boa",
  poor: "Ruim",
  lost: "Caiu",
  unknown: "..."
};
