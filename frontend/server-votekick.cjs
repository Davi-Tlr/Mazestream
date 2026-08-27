const VOTE_KICK_TTL_MS = 90 * 1000;

function requiredVoteCount(participantCount) {
  const total = Math.max(0, Math.floor(Number(participantCount) || 0));
  const eligibleVoters = Math.max(0, total - 1);
  return Math.max(2, Math.floor(eligibleVoters / 2) + 1);
}

function registerVote(voteKicks, options) {
  const now = Number(options.now) || Date.now();
  const targetIdentity = String(options.targetIdentity || "");
  const voterIdentity = String(options.voterIdentity || "");
  const required = requiredVoteCount(options.participantCount);
  let state = voteKicks.get(targetIdentity);

  if (!state || state.expiresAt <= now) {
    state = {
      targetIdentity,
      targetName: String(options.targetName || targetIdentity).slice(0, 80),
      createdAt: now,
      expiresAt: now + VOTE_KICK_TTL_MS,
      voters: new Set(),
      removing: false
    };
    voteKicks.set(targetIdentity, state);
  }

  const duplicate = state.voters.has(voterIdentity);
  if (!duplicate && !state.removing) state.voters.add(voterIdentity);
  return {
    state,
    duplicate,
    votes: state.voters.size,
    required,
    reached: state.voters.size >= required
  };
}

function cleanupVoteKicks(voteKicks, now = Date.now()) {
  for (const [identity, state] of voteKicks) {
    if (!state || state.expiresAt <= now) voteKicks.delete(identity);
  }
}

module.exports = { VOTE_KICK_TTL_MS, requiredVoteCount, registerVote, cleanupVoteKicks };
