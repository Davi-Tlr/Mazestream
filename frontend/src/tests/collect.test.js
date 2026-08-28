import test from "node:test";
import assert from "node:assert/strict";
import { getPersonSettings } from "../features/room/collect.js";

test("preferências pessoais usam identidade e preservam fallback legado por nome", () => {
  const settings = {
    ana: { muted: true, volume: 12 },
    "PA_123": { muted: false, volume: 74 }
  };
  assert.equal(getPersonSettings(settings, "PA_123", "ana").muted, false);
  assert.equal(getPersonSettings(settings, "PA_123", "ana").volume, 74);
  assert.equal(getPersonSettings(settings, "PA_456", "ana").muted, true);
  assert.equal(getPersonSettings(settings, "PA_456", "ana").volume, 12);
});
