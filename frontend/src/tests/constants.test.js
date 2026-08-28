import test from "node:test";
import assert from "node:assert/strict";
import { CONTENT_OPTIONS, DEFAULT_SETTINGS, SEND_OPTIONS, SEND_PRESETS } from "../config/constants.js";
import { resolveAppProfile } from "../config/appProfile.js";

test("a transmissão padrão é 1080p a 30fps", () => {
  const preset = SEND_PRESETS[DEFAULT_SETTINGS.sendQuality];
  assert.equal(DEFAULT_SETTINGS.sendQuality, "high");
  assert.deepEqual({ width: preset.w, height: preset.h, fps: preset.fps }, {
    width: 1920,
    height: 1080,
    fps: 30
  });
  assert.equal(preset.br, 5_000_000);
});

test("há perfis separados para movimento e detalhes", () => {
  assert.deepEqual(CONTENT_OPTIONS.map((option) => option.value), ["motion", "detail"]);
  assert.equal(DEFAULT_SETTINGS.shareContent, "motion");
});

test("as opções de transmissão usam linguagem simples na interface", () => {
  assert.deepEqual(SEND_OPTIONS.map((option) => option.label), ["Mais qualidade", "Equilibrada", "Mais leve"]);
  assert.ok(SEND_OPTIONS.every((option) => !/Mbps|kbps|fps|1080p|720p|540p|VP[89]/i.test(option.label)));
});

test("o perfil do Oracle preserva 1080p30 com teto de banda menor", () => {
  const local = resolveAppProfile("local");
  const host = resolveAppProfile("host-a1");
  assert.equal(local.screenBitrates.high, 5_000_000);
  assert.equal(host.screenBitrates.high, 4_000_000);
  assert.equal(resolveAppProfile("desconhecido", true).id, "host-a1");
  assert.equal(resolveAppProfile("desconhecido", false).id, "local");
});
