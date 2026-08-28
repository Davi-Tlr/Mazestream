import test from "node:test";
import assert from "node:assert/strict";
import { chooseScreenAudioPublication } from "../features/clips/clipTrackSelection.js";

const source = "screen-audio";
const publication = (name) => ({ trackName: name, source, track: { kind: "audio", id: name } });

test("associa o áudio pelo nome da tela quando há duas transmissões", () => {
  const first = publication("tela-1");
  const second = publication("tela-2");
  assert.equal(chooseScreenAudioPublication([first, second], "tela-1", source), first);
  assert.equal(chooseScreenAudioPublication([first, second], "tela-2", source), second);
});

test("não escolhe áudio arbitrário quando não existe correspondência", () => {
  assert.equal(chooseScreenAudioPublication([publication("a"), publication("b")], "c", source), null);
});
