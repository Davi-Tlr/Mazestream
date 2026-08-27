import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { VOTE_KICK_TTL_MS, requiredVoteCount, registerVote, cleanupVoteKicks } = require("../server-votekick.cjs");

test("votekick exige maioria, com mínimo de dois votos", () => {
  assert.equal(requiredVoteCount(3), 2);
  assert.equal(requiredVoteCount(4), 2);
  assert.equal(requiredVoteCount(5), 3);
  assert.equal(requiredVoteCount(10), 5);
});

test("cada identidade vota uma vez e a votação expira", () => {
  const votes = new Map();
  const first = registerVote(votes, {
    targetIdentity: "alvo", targetName: "Alvo", voterIdentity: "a", participantCount: 3, now: 1
  });
  const duplicate = registerVote(votes, {
    targetIdentity: "alvo", targetName: "Alvo", voterIdentity: "a", participantCount: 3, now: 2
  });
  const majority = registerVote(votes, {
    targetIdentity: "alvo", targetName: "Alvo", voterIdentity: "b", participantCount: 3, now: 3
  });

  assert.equal(first.votes, 1);
  assert.equal(first.reached, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.votes, 1);
  assert.equal(majority.votes, 2);
  assert.equal(majority.reached, true);

  cleanupVoteKicks(votes, 1 + VOTE_KICK_TTL_MS);
  assert.equal(votes.size, 0);
});
