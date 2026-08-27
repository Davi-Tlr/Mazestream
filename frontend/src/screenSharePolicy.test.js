import test from "node:test";
import assert from "node:assert/strict";
import { chooseScreenCodec } from "./screenSharePolicy.js";

test("detalhes usa VP8 para preservar contentHint e simulcast espacial", () => {
  assert.equal(chooseScreenCodec("detail", true), "vp8");
  assert.equal(chooseScreenCodec("detail", false), "vp8");
});

test("movimento prefere VP9 quando o navegador suporta", () => {
  assert.equal(chooseScreenCodec("motion", true), "vp9");
  assert.equal(chooseScreenCodec("motion", false), "vp8");
});
