import test from "node:test";
import assert from "node:assert/strict";
import {
  INTERACTION_LIFETIME, REACTION_EMOJIS, STREAM_DRAWING_TTL_MS,
  decodeInteraction, encodeInteraction, encodeInteractionForTransport, sanitizeColor, sanitizeDrawAction
} from "./interactions.js";

test("aceita cores hex personalizadas e rejeita valores inseguros", () => {
  assert.equal(sanitizeColor("#12AbEf"), "#12abef");
  assert.equal(sanitizeColor("red; background:url(x)"), "#ffffff");
});

test("preserva ferramenta e limita pontos recebidos pela rede", () => {
  const action = sanitizeDrawAction({
    id: "erase-1",
    tool: "eraser",
    width: 7,
    points: [[-2, 0.2], [0.5, 3]]
  });
  assert.equal(action.id, "erase-1");
  assert.equal(action.tool, "eraser");
  assert.equal(action.width, 7);
  assert.deepEqual(action.points, [[0, 0.2], [0.5, 1]]);
});

test("descarta pacotes de interação excessivamente grandes", () => {
  const oversized = new Uint8Array(64 * 1024 + 1);
  assert.equal(decodeInteraction(oversized), null);
});

test("compacta o alias legado em traços longos antes de enviar", () => {
  const points = Array.from({ length: 600 }, (_, index) => [
    (index * 7919 % 10000) / 10000,
    (index * 3571 % 10000) / 10000
  ]);
  const value = { type: "stroke", points, pts: points };
  assert.ok(encodeInteraction(value).byteLength > 12 * 1024);
  const encoded = encodeInteractionForTransport(value);
  assert.ok(encoded.byteLength <= 12 * 1024);
  const decoded = decodeInteraction(encoded);
  assert.equal(decoded.points.length, 600);
  assert.equal("pts" in decoded, false);
});

test("o conjunto novo de reações tem oito emojis válidos", () => {
  assert.equal(Object.keys(REACTION_EMOJIS).length, 8);
  assert.equal(REACTION_EMOJIS.thumbsUp, "👍");
});

test("desenhos sobre a transmissão são explicitamente temporários", () => {
  assert.equal(STREAM_DRAWING_TTL_MS, 10_000);
  assert.equal(INTERACTION_LIFETIME.stroke, STREAM_DRAWING_TTL_MS);
});

test("a reação permanece até a animação mais lenta terminar", () => {
  assert.ok(INTERACTION_LIFETIME.reaction >= 4400);
});
