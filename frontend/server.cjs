// Mazestream frontend/token server.
// Node puro, sem dependencias: serve o build, emite JWTs do LiveKit e guarda
// somente estado efemero de sala (host/PIN/preset/apresentador + arquivos temporarios).

const http = require("http");
const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { registerVote, cleanupVoteKicks } = require("./server-votekick.cjs");

function boundedInt(name, fallback, min, max) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

const API_KEY = process.env.LIVEKIT_API_KEY || "";
const API_SECRET = process.env.LIVEKIT_API_SECRET || "";
const WSS_URL = process.env.PUBLIC_WSS_URL || "";
const API_URL = (process.env.LIVEKIT_API_URL
  || WSS_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:")).replace(/\/+$/, "");
const MAX_ROOMS = boundedInt("MAX_ROOMS", 2, 1, 1000);
const MAX_PARTICIPANTS_PER_ROOM = boundedInt("MAX_PARTICIPANTS_PER_ROOM", 10, 2, 100);
const TOKENS_POR_SEG = boundedInt("TOKENS_POR_SEG", 20, 1, 1000);
const PORT = boundedInt("PORT", 3000, 1, 65535);
const HOST = process.env.HOST || "0.0.0.0";
const DIST = path.resolve(process.env.MAZESTREAM_DIST_DIR || path.join(__dirname, "dist"));
const SHARE_MAX_MB = boundedInt("SHARE_MAX_MB", 8, 1, 20);
const SHARE_TOTAL_MB = Math.max(SHARE_MAX_MB, boundedInt("SHARE_TOTAL_MB", 32, 1, 128));
const SHARE_TTL_MS = boundedInt("SHARE_TTL_MIN", 60, 5, 180) * 60 * 1000;
const SHARE_MAX_FILES = boundedInt("SHARE_MAX_FILES", 128, 1, 1024);
const SHARE_MAX_UPLOADS = boundedInt("SHARE_MAX_UPLOADS", 2, 1, 4);
const SHARE_UPLOADS_PER_MINUTE = boundedInt("SHARE_UPLOADS_PER_MINUTE", 6, 1, 60);
const ROOM_STATE_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

if (!API_KEY || !API_SECRET) {
  console.error("LIVEKIT_API_KEY / LIVEKIT_API_SECRET nao definidos.");
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript",
  ".mjs": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".pdf": "application/pdf",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff": "font/woff",
  ".woff2": "font/woff2", ".map": "application/json"
};
const PRESETS = new Set(["livre", "jogo", "rpg", "apresentacao"]);

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function signJwt(payload) {
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac("sha256", API_SECRET).update(h + "." + p).digest());
  return h + "." + p + "." + sig;
}
function entryToken(identity, name, room, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({
    iss: API_KEY, sub: identity, name: name || identity,
    nbf: now, exp: now + 6 * 3600, jti: identity + "-" + now,
    video: {
      room,
      roomJoin: true,
      canPublish: options.canPublish !== false,
      canSubscribe: true,
      canPublishData: options.canPublishData !== false,
      canUpdateOwnMetadata: true
    }
  });
}
function adminToken(grant) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({ iss: API_KEY, sub: "mazestream-admin", nbf: now, exp: now + 60, video: grant });
}
function listAdminToken() { return adminToken({ roomList: true }); }
function createAdminToken() { return adminToken({ roomCreate: true }); }
function roomAdminToken(room) { return adminToken({ room, roomAdmin: true }); }

function safeRoom(value) {
  return String(value || "sala").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "sala";
}
function safeName(value) {
  const raw = String(value || "convidado").trim().slice(0, 40) || "convidado";
  return raw.replace(/[\r\n\t]/g, " ");
}
function safeIdentityBase(value) {
  return safeName(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]/g, "") || "convidado";
}
function randomKey(bytes = 18) { return crypto.randomBytes(bytes).toString("base64url"); }
function hashPin(pin, salt) {
  return crypto.createHash("sha256").update(String(salt) + "\0" + String(pin || "")).digest("hex");
}
function checkPin(config, pin) {
  if (!config.pinHash) return true;
  const candidate = Buffer.from(hashPin(pin, config.pinSalt), "hex");
  const expected = Buffer.from(config.pinHash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}
function setPin(config, pin) {
  const clean = String(pin || "").trim().slice(0, 24);
  if (!clean) {
    config.pinSalt = "";
    config.pinHash = "";
    return;
  }
  config.pinSalt = randomKey(10);
  config.pinHash = hashPin(clean, config.pinSalt);
}

// Estado efemero. Reiniciar o container limpa salas, sessoes e uploads temporarios.
const roomConfigs = new Map();
const sessions = new Map();
const sharedFiles = new Map();
let sharedBytes = 0;
let pendingShareBytes = 0;
let pendingShares = 0;

function getRoomConfig(room, create = false, requestedPreset = "livre") {
  let config = roomConfigs.get(room);
  if (!config && create) {
    config = {
      createdAt: Date.now(), touchedAt: Date.now(),
      hostClaim: randomKey(24), hostIdentity: "",
      pinSalt: "", pinHash: "",
      preset: PRESETS.has(requestedPreset) ? requestedPreset : "livre",
      presenter: null,
      permissions: new Map(),
      voteKicks: new Map()
    };
    roomConfigs.set(room, config);
  }
  if (config) config.touchedAt = Date.now();
  return config;
}
function publicRoomState(config) {
  return {
    preset: config?.preset || "livre",
    presenter: config?.presenter || null,
    locked: !!config?.pinHash,
    hostIdentity: config?.hostIdentity || ""
  };
}
function createSession(room, identity, isHost, role) {
  const key = randomKey(24);
  sessions.set(key, { room, identity, isHost: !!isHost, role, expiresAt: Date.now() + SESSION_TTL_MS });
  return key;
}
function getSession(req) {
  const key = String(req.headers["x-maze-session"] || "");
  const session = sessions.get(key);
  if (!session || session.expiresAt < Date.now()) {
    if (session) sessions.delete(key);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function cleanupEphemeral() {
  const now = Date.now();
  for (const [key, session] of sessions) if (session.expiresAt < now) sessions.delete(key);
  for (const [id, file] of sharedFiles) {
    if (file.expiresAt < now) {
      sharedBytes -= file.buffer.length;
      sharedFiles.delete(id);
    }
  }
  for (const [room, config] of roomConfigs) {
    cleanupVoteKicks(config.voteKicks || new Map(), now);
    if (now - config.touchedAt > ROOM_STATE_TTL_MS) roomConfigs.delete(room);
  }
}
setInterval(cleanupEphemeral, 5 * 60 * 1000).unref();

function twirp(method, token, body) {
  return new Promise((resolve, reject) => {
    if (!API_URL) return reject(new Error("LIVEKIT_API_URL/PUBLIC_WSS_URL ausente"));
    let target;
    try { target = new URL(API_URL + "/twirp/livekit.RoomService/" + method); }
    catch (e) { return reject(e); }
    const mod = target.protocol === "https:" ? https : http;
    const payload = JSON.stringify(body || {});
    const request = mod.request({
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: target.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
        "Content-Length": Buffer.byteLength(payload)
      }
    }, (response) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
        if (data.length > 2e6) request.destroy(new Error("resposta grande"));
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error(method + " HTTP " + response.statusCode + " " + data.slice(0, 240)));
        }
        if (!data) return resolve({});
        try { resolve(JSON.parse(data)); } catch (e) { resolve({}); }
      });
    });
    request.setTimeout(3000, () => request.destroy(new Error("timeout")));
    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

let roomCache = { at: 0, data: null, promise: null };
const ROOM_CACHE_MS = 3000;
async function listRoomsReal() {
  const result = await twirp("ListRooms", listAdminToken(), {});
  return result.rooms || [];
}
function listRooms() {
  const now = Date.now();
  if (roomCache.data && now - roomCache.at < ROOM_CACHE_MS) return Promise.resolve(roomCache.data);
  if (roomCache.promise) return roomCache.promise;
  roomCache.promise = listRoomsReal().then((rooms) => {
    roomCache = { at: Date.now(), data: rooms, promise: null };
    return rooms;
  }).catch((error) => { roomCache.promise = null; throw error; });
  return roomCache.promise;
}
let admissionQueue = Promise.resolve();
function serializedAdmission(task) {
  const operation = admissionQueue.then(task, task);
  admissionQueue = operation.catch(() => {});
  return operation;
}
function roomCapacity(room) {
  const current = Number(room?.num_participants ?? room?.numParticipants ?? 0);
  const configured = Number(room?.max_participants ?? room?.maxParticipants ?? 0);
  const maximum = configured > 0 ? configured : MAX_PARTICIPANTS_PER_ROOM;
  return { current, maximum, available: current < maximum };
}
async function ensureRoomAdmission(roomName) {
  try {
    const cachedRooms = await listRooms();
    const cached = cachedRooms.find((item) => item.name === roomName);
    if (cached) {
      const capacity = roomCapacity(cached);
      return capacity.available
        ? { allowed: true, existing: true, capacity }
        : { allowed: false, status: 429, reason: "room-full", capacity };
    }

    return serializedAdmission(async () => {
      const now = Date.now();
      const rooms = roomCache.data && now - roomCache.at < ROOM_CACHE_MS
        ? roomCache.data
        : await listRoomsReal();
      const existing = rooms.find((item) => item.name === roomName);
      if (existing) {
        const capacity = roomCapacity(existing);
        return capacity.available
          ? { allowed: true, existing: true, capacity }
          : { allowed: false, status: 429, reason: "room-full", capacity };
      }
      if (rooms.length >= MAX_ROOMS) {
        return { allowed: false, status: 429, reason: "server-full" };
      }

      const created = await twirp("CreateRoom", createAdminToken(), {
        name: roomName,
        empty_timeout: 300,
        departure_timeout: 20,
        max_participants: MAX_PARTICIPANTS_PER_ROOM
      });
      roomCache = { at: Date.now(), data: rooms.concat([created]), promise: null };
      return {
        allowed: true,
        existing: false,
        capacity: { current: 0, maximum: MAX_PARTICIPANTS_PER_ROOM, available: true }
      };
    });
  } catch (error) {
    console.warn("Nao consegui preparar a sala:", error.message);
    return { allowed: false, status: 503, reason: "livekit-unavailable" };
  }
}

let tokenWindow = { sec: 0, count: 0 };
function tokenAllowed() {
  const sec = Math.floor(Date.now() / 1000);
  if (sec !== tokenWindow.sec) tokenWindow = { sec, count: 0 };
  tokenWindow.count += 1;
  return tokenWindow.count <= TOKENS_POR_SEG;
}

function json(res, code, value) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}
function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      chunks.length = 0;
      reject(error);
    };
    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        fail(Object.assign(new Error("corpo grande"), { statusCode: 413 }));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      const body = Buffer.concat(chunks, size);
      chunks.length = 0;
      resolve(body);
    });
    req.on("aborted", () => fail(Object.assign(new Error("upload interrompido"), { statusCode: 400 })));
    req.on("close", () => {
      if (!req.complete) fail(Object.assign(new Error("requisição interrompida"), { statusCode: 400 }));
    });
    req.on("error", fail);
  });
}
async function readJson(req, maxBytes = 64 * 1024) {
  const body = await readBody(req, maxBytes);
  if (!body.length) return {};
  return JSON.parse(body.toString("utf8"));
}
function acceptsEncoding(header, encoding) {
  return String(header || "").toLowerCase().split(",").some((part) => {
    const [name, ...parameters] = part.trim().split(";");
    if (name !== encoding && name !== "*") return false;
    const quality = parameters.find((parameter) => parameter.trim().startsWith("q="));
    return !quality || Number.parseFloat(quality.split("=")[1]) > 0;
  });
}
function serveFile(req, res, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const compressible = [".css", ".html", ".js", ".json", ".mjs", ".svg", ".webmanifest"].includes(extension);
  const accepted = req.headers["accept-encoding"];
  const candidates = compressible
    ? [
        acceptsEncoding(accepted, "br") && { path: filePath + ".br", encoding: "br" },
        acceptsEncoding(accepted, "gzip") && { path: filePath + ".gz", encoding: "gzip" }
      ].filter(Boolean)
    : [];
  candidates.push({ path: filePath, encoding: "" });

  const readCandidate = (index) => {
    const candidate = candidates[index];
    fs.readFile(candidate.path, (err, buffer) => {
      if (err && index + 1 < candidates.length) { readCandidate(index + 1); return; }
      if (err) { res.writeHead(404); res.end("nao encontrado"); return; }

      const basename = path.basename(filePath);
      const immutable = filePath.includes(path.sep + "assets" + path.sep)
        && /-[A-Za-z0-9_-]{8,}\.[^.]+$/.test(basename);
      const cacheControl = extension === ".html" || basename === "sw.js" || basename === "build-info.json" || extension === ".webmanifest"
        ? "no-cache"
        : (immutable ? "public, max-age=31536000, immutable" : "public, max-age=86400");
      const headers = {
        "Content-Type": TYPES[extension] || "application/octet-stream",
        "Content-Length": buffer.length,
        "Cache-Control": cacheControl,
        "X-Content-Type-Options": "nosniff"
      };
      if (compressible) headers.Vary = "Accept-Encoding";
      if (candidate.encoding) headers["Content-Encoding"] = candidate.encoding;
      res.writeHead(200, headers);
      res.end(req.method === "HEAD" ? undefined : buffer);
    });
  };

  readCandidate(0);
}
function effectiveWss(req) {
  if (WSS_URL) return WSS_URL;
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const secure = req.headers["x-forwarded-proto"] === "https" || (req.socket && req.socket.encrypted);
  return (secure ? "wss:" : "ws:") + "//" + host;
}

async function handleToken(req, res, url) {
  if (req.method !== "GET") { res.writeHead(405); res.end("metodo"); return; }
  if (!tokenAllowed()) { json(res, 429, { error: "flood", motivo: "Muitas requisicoes agora. Tente de novo em instantes." }); return; }

  const room = safeRoom(url.searchParams.get("room"));
  const name = safeName(url.searchParams.get("name"));
  const role = url.searchParams.get("role") === "spectator" ? "spectator" : "participant";
  const requestedPreset = PRESETS.has(url.searchParams.get("preset")) ? url.searchParams.get("preset") : "livre";
  const requestedPin = String(req.headers["x-maze-pin"] || url.searchParams.get("pin") || "").slice(0, 24);
  const hostClaim = String(req.headers["x-maze-host-claim"] || url.searchParams.get("hostClaim") || "").slice(0, 80);

  let config = getRoomConfig(room, false);
  let validHostClaim = !!config && !!hostClaim && hostClaim === config.hostClaim;
  if (config && !validHostClaim && !checkPin(config, requestedPin)) {
    json(res, 403, { error: "pin", motivo: requestedPin ? "PIN incorreto." : "Esta sala está bloqueada. Informe o PIN." });
    return;
  }

  const admission = await ensureRoomAdmission(room);
  if (!admission.allowed) {
    if (admission.reason === "room-full") {
      json(res, admission.status, { error: "limite", motivo: "Esta sala atingiu o limite de " + admission.capacity.maximum + " pessoas. Espere alguém sair." });
    } else if (admission.reason === "server-full") {
      json(res, admission.status, { error: "limite", motivo: "Servidor cheio: já existem " + MAX_ROOMS + " salas abertas. Espere uma esvaziar ou entre numa sala existente." });
    } else {
      json(res, admission.status, { error: "livekit", motivo: "Não consegui confirmar a capacidade do servidor agora. Tente novamente em instantes." });
    }
    return;
  }

  // Another first entrant may have initialized the in-memory room state while
  // this request was waiting on LiveKit. Re-read it and enforce its PIN before
  // deciding who receives the host claim; otherwise two concurrent requests
  // could both become host or bypass a PIN set by the first request.
  config = getRoomConfig(room, false);
  validHostClaim = !!config && !!hostClaim && hostClaim === config.hostClaim;
  if (config && !validHostClaim && !checkPin(config, requestedPin)) {
    json(res, 403, { error: "pin", motivo: requestedPin ? "PIN incorreto." : "Esta sala está bloqueada. Informe o PIN." });
    return;
  }
  const newRoomState = !config;
  if (!config) config = getRoomConfig(room, true, requestedPreset);

  const identity = safeIdentityBase(name) + "-" + crypto.randomBytes(3).toString("hex");
  let isHost = false;
  let returnedHostClaim = "";
  if (newRoomState) {
    isHost = true;
    config.hostIdentity = identity;
    returnedHostClaim = config.hostClaim;
    if (requestedPin) setPin(config, requestedPin);
  } else if (validHostClaim) {
    isHost = true;
    config.hostIdentity = identity;
    returnedHostClaim = config.hostClaim;
  }

  const canPublish = isHost || role !== "spectator";
  const canPublishData = true;
  const effectiveRole = canPublish ? "participant" : "spectator";
  config.permissions.set(identity, { canPublish, canPublishData });
  config.touchedAt = Date.now();
  const session = createSession(room, identity, isHost, effectiveRole);

  json(res, 200, {
    token: entryToken(identity, name, room, { canPublish, canPublishData }),
    room,
    url: effectiveWss(req),
    identity,
    session,
    isHost,
    hostClaim: returnedHostClaim,
    role: effectiveRole,
    roomState: publicRoomState(config)
  });
}

async function handleRoomControl(req, res) {
  if (req.method !== "POST") { res.writeHead(405); res.end("metodo"); return; }
  const session = getSession(req);
  if (!session) { json(res, 401, { error: "session", motivo: "Sessão expirada. Entre na sala novamente." }); return; }
  const config = getRoomConfig(session.room, false);
  if (!config) { json(res, 404, { error: "room" }); return; }

  let body;
  try { body = await readJson(req); }
  catch (e) {
    json(res, e.statusCode || 400, { error: "json", motivo: e.statusCode === 413 ? "Pedido grande demais." : "Pedido inválido." });
    return;
  }

  const action = String(body.action || "");

  if (action === "vote-kick") {
    const voteNow = Date.now();
    if ((session.voteKickReadyAt || 0) > voteNow) {
      json(res, 429, { error: "vote-rate", motivo: "Espere um instante antes de votar novamente." });
      return;
    }
    session.voteKickReadyAt = voteNow + 800;
    const identity = String(body.identity || "").slice(0, 180);
    if (!identity || identity === session.identity) {
      json(res, 400, { error: "identity", motivo: "Escolha outra pessoa para a votação." });
      return;
    }
    if (identity === config.hostIdentity) {
      json(res, 403, { error: "host-target", motivo: "O host não pode ser alvo de votekick." });
      return;
    }

    let participants;
    try {
      const result = await twirp("ListParticipants", roomAdminToken(session.room), { room: session.room });
      participants = Array.isArray(result.participants) ? result.participants : [];
    } catch (e) {
      console.warn("Falha ao consultar participantes para votekick:", e.message);
      json(res, 502, { error: "livekit", motivo: "Não consegui confirmar quem está na sala agora." });
      return;
    }

    const voter = participants.find((participant) => participant.identity === session.identity);
    const target = participants.find((participant) => participant.identity === identity);
    if (!voter) {
      json(res, 403, { error: "voter-absent", motivo: "Você precisa estar conectado à sala para votar." });
      return;
    }
    if (!target) {
      if (config.voteKicks) config.voteKicks.delete(identity);
      json(res, 404, { error: "target-absent", motivo: "Essa pessoa já saiu da sala." });
      return;
    }
    if (participants.length < 3) {
      json(res, 409, { error: "few-participants", motivo: "O votekick precisa de pelo menos três pessoas na sala." });
      return;
    }

    if (!config.voteKicks) config.voteKicks = new Map();
    cleanupVoteKicks(config.voteKicks);
    const vote = registerVote(config.voteKicks, {
      targetIdentity: identity,
      targetName: target.name || target.identity,
      voterIdentity: session.identity,
      participantCount: participants.length
    });
    config.touchedAt = Date.now();

    if (vote.reached && !vote.state.removing) {
      vote.state.removing = true;
      try {
        await twirp("RemoveParticipant", roomAdminToken(session.room), { room: session.room, identity });
      } catch (e) {
        vote.state.removing = false;
        console.warn("Falha ao concluir votekick:", e.message);
        json(res, 502, { error: "livekit", motivo: "A votação passou, mas o LiveKit não conseguiu remover a pessoa." });
        return;
      }
      config.voteKicks.delete(identity);
      json(res, 200, {
        ok: true, kicked: true, votes: vote.votes, required: vote.required,
        targetIdentity: identity, targetName: vote.state.targetName,
        roomState: publicRoomState(config)
      });
      return;
    }

    json(res, 200, {
      ok: true, kicked: false, pending: !!vote.state.removing, duplicate: vote.duplicate,
      votes: vote.votes, required: vote.required, expiresAt: vote.state.expiresAt,
      targetIdentity: identity, targetName: vote.state.targetName,
      roomState: publicRoomState(config)
    });
    return;
  }

  if (!session.isHost || session.identity !== config.hostIdentity) {
    json(res, 403, { error: "host", motivo: "Só o host atual pode fazer isso." });
    return;
  }

  if (action === "pin") {
    setPin(config, body.pin);
  } else if (action === "preset") {
    if (!PRESETS.has(body.preset)) { json(res, 400, { error: "preset" }); return; }
    config.preset = body.preset;
  } else if (action === "presenter") {
    const target = body.presenter;
    if (!target) config.presenter = null;
    else if (target.kind === "board") config.presenter = { kind: "board" };
    else if (target.kind === "track") config.presenter = {
      kind: "track",
      identity: String(target.identity || "").slice(0, 160),
      pubName: String(target.pubName || "").slice(0, 160),
      source: String(target.source || "").slice(0, 80)
    };
    else { json(res, 400, { error: "presenter" }); return; }
  } else if (action === "permission") {
    const identity = String(body.identity || "").slice(0, 180);
    if (!identity) { json(res, 400, { error: "identity" }); return; }
    const canPublish = body.canPublish !== false;
    const canPublishData = body.canPublishData !== false;
    try {
      await twirp("UpdateParticipant", roomAdminToken(session.room), {
        room: session.room,
        identity,
        permission: {
          can_subscribe: true,
          can_publish: canPublish,
          can_publish_data: canPublishData
        }
      });
      config.permissions.set(identity, { canPublish, canPublishData });
    } catch (e) {
      console.warn("Falha ao atualizar permissao:", e.message);
      json(res, 502, { error: "livekit", motivo: "O LiveKit não aceitou a mudança de permissão." });
      return;
    }
  } else if (action === "kick") {
    const identity = String(body.identity || "").slice(0, 180);
    if (!identity || identity === session.identity) { json(res, 400, { error: "identity" }); return; }
    try {
      await twirp("RemoveParticipant", roomAdminToken(session.room), { room: session.room, identity });
    } catch (e) {
      json(res, 502, { error: "livekit", motivo: "Não consegui remover esta pessoa." });
      return;
    }
    if (config.voteKicks) config.voteKicks.delete(identity);
  } else {
    json(res, 400, { error: "action" });
    return;
  }
  config.touchedAt = Date.now();
  json(res, 200, { ok: true, roomState: publicRoomState(config) });
}

async function handleShare(req, res, url) {
  if (req.method !== "POST") { res.writeHead(405); res.end("metodo"); return; }
  const refuse = (status, motivo) => {
    // Do not keep an unread request body alive on a rejected upload.
    res.setHeader("Connection", "close");
    json(res, status, { error: "arquivo", motivo });
    req.resume();
  };
  const session = getSession(req);
  if (!session) { refuse(401, "Sessão expirada."); return; }
  const maxBytes = SHARE_MAX_MB * 1024 * 1024;
  const length = req.headers["content-length"];
  const declaredBytes = length === undefined ? null : Number(length);
  if (declaredBytes !== null && (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0 || declaredBytes > maxBytes)) {
    refuse(413, "Arquivo grande demais. Limite: " + SHARE_MAX_MB + " MB."); return;
  }
  if (declaredBytes === 0) { refuse(400, "Arquivo vazio."); return; }
  cleanupEphemeral();
  if (session.uploadInFlight || pendingShares >= SHARE_MAX_UPLOADS) {
    res.setHeader("Retry-After", "2");
    refuse(429, "Há uploads em andamento. Aguarde e tente novamente."); return;
  }
  const now = Date.now();
  const window = session.uploadWindow;
  if (!window || now - window.start >= 60000) session.uploadWindow = { start: now, count: 0 };
  if (session.uploadWindow.count >= SHARE_UPLOADS_PER_MINUTE) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((session.uploadWindow.start + 60000 - now) / 1000))));
    refuse(429, "Limite de uploads por minuto atingido. Aguarde para enviar outro arquivo."); return;
  }
  // Reserve capacity before reading. Chunked bodies reserve their maximum.
  // The file-count cap also bounds metadata for many tiny files.
  const reservedBytes = declaredBytes ?? maxBytes;
  if (sharedFiles.size + pendingShares >= SHARE_MAX_FILES
      || sharedBytes + pendingShareBytes + reservedBytes > SHARE_TOTAL_MB * 1024 * 1024) {
    refuse(507, "O espaço temporário de arquivos está cheio. Tente novamente mais tarde."); return;
  }
  session.uploadWindow.count += 1;
  session.uploadInFlight = true;
  pendingShares += 1;
  pendingShareBytes += reservedBytes;
  try {
    const buffer = await readBody(req, reservedBytes);
    if (!buffer.length) { refuse(400, "Arquivo vazio."); return; }
    const id = randomKey(18);
    const rawName = String(url.searchParams.get("name") || "arquivo").replace(/[\r\n\t]/g, " ").slice(0, 120) || "arquivo";
    const rawType = String(url.searchParams.get("type") || "application/octet-stream").slice(0, 100);
    const safeType = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/plain)$/i.test(rawType) ? rawType : "application/octet-stream";
    sharedFiles.set(id, {
      buffer, name: rawName, type: safeType, room: session.room,
      expiresAt: Date.now() + SHARE_TTL_MS
    });
    sharedBytes += buffer.length;
    json(res, 200, { id, name: rawName, type: safeType, size: buffer.length, url: "/shared/" + id });
  } catch (error) {
    if (!res.destroyed && !res.headersSent) refuse(error.statusCode || 400,
      error.statusCode === 413 ? "Arquivo grande demais. Limite: " + SHARE_MAX_MB + " MB." : "O envio foi interrompido. Tente novamente.");
  } finally {
    session.uploadInFlight = false;
    pendingShares -= 1;
    pendingShareBytes -= reservedBytes;
  }
}

function handleSharedFile(req, res, id) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end("metodo"); return; }
  const file = sharedFiles.get(id);
  if (!file || file.expiresAt < Date.now()) {
    if (file) { sharedBytes -= file.buffer.length; sharedFiles.delete(id); }
    res.writeHead(404); res.end("arquivo expirado"); return;
  }
  const inline = file.type.startsWith("image/") || file.type === "application/pdf" || file.type === "text/plain";
  const asciiName = file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 100) || "arquivo";
  res.writeHead(200, {
    "Content-Type": file.type,
    "Content-Length": file.buffer.length,
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": (inline ? "inline" : "attachment") + "; filename=\"" + asciiName.replace(/\"/g, "") + "\""
  });
  res.end(req.method === "HEAD" ? undefined : file.buffer);
}

async function handler(req, res) {
  if (!req.url || req.url.length > 4096) { res.writeHead(414); res.end("uri grande"); return; }
  let url;
  try { url = new URL(req.url, "http://localhost"); } catch (e) { res.writeHead(400); res.end("url invalida"); return; }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Maze-Session, X-Maze-Pin, X-Maze-Host-Claim");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (url.pathname === "/token") return handleToken(req, res, url);
  if (url.pathname === "/api/room-control") return handleRoomControl(req, res);
  if (url.pathname === "/api/share") return handleShare(req, res, url);
  if (url.pathname.startsWith("/shared/")) return handleSharedFile(req, res, url.pathname.slice("/shared/".length));

  let rel;
  try { rel = path.normalize(decodeURIComponent(url.pathname)); }
  catch (e) { rel = "/index.html"; }
  rel = rel.replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(DIST, rel.replace(/^[/\\]+/, ""));
  const relative = path.relative(DIST, filePath);
  if (relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) { res.writeHead(403); res.end("proibido"); return; }
  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) { serveFile(req, res, filePath); return; }
    const acceptsHtml = String(req.headers.accept || "").toLowerCase().includes("text/html");
    if (acceptsHtml && (req.method === "GET" || req.method === "HEAD")) {
      serveFile(req, res, path.join(DIST, "index.html"));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("nao encontrado");
  });
}

const server = http.createServer((req, res) => {
  Promise.resolve().then(() => handler(req, res)).catch((error) => {
    console.error("Erro no handler:", error && error.message);
    try { json(res, 500, { error: "interno", motivo: "Erro interno." }); } catch (e) {}
  });
});
server.requestTimeout = 15000;
server.headersTimeout = 8000;
server.keepAliveTimeout = 8000;
server.on("connection", (socket) => socket.setTimeout(20000, () => socket.destroy()));
server.listen(PORT, HOST, () => {
  console.log("Mazestream na porta " + PORT + " | max salas: " + MAX_ROOMS + " | max pessoas/sala: " + MAX_PARTICIPANTS_PER_ROOM + " | /token/s: " + TOKENS_POR_SEG
    + " | upload temporario: " + SHARE_MAX_MB + " MB | API: " + (API_URL || "nao configurada"));
});
