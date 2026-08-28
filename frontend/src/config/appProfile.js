const PROFILE_DEFINITIONS = Object.freeze({
  local: Object.freeze({
    id: "local",
    label: "Local",
    screenBitrates: Object.freeze({ high: 5_000_000, medium: 2_200_000, low: 1_000_000 }),
    diagnostics: true
  }),
  "host-a1": Object.freeze({
    id: "host-a1",
    label: "Host A1",
    // 1080p30 is preserved. The lower ceiling limits SFU egress while VP9/SVC
    // and simulcast let each subscriber receive only the layer it can display.
    screenBitrates: Object.freeze({ high: 4_000_000, medium: 1_800_000, low: 800_000 }),
    diagnostics: false
  })
});

export function resolveAppProfile(requested, production = false) {
  const fallback = production ? "host-a1" : "local";
  const id = String(requested || fallback).trim().toLowerCase();
  return PROFILE_DEFINITIONS[id] || PROFILE_DEFINITIONS[fallback];
}

const viteEnv = import.meta.env || {};

export const APP_PROFILE = resolveAppProfile(
  viteEnv.VITE_MAZESTREAM_PROFILE,
  Boolean(viteEnv.PROD)
);

export const APP_PROFILE_DEFINITIONS = PROFILE_DEFINITIONS;
