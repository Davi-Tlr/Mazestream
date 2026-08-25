// Mazestream frontend/token server.
// Node puro, sem dependencias: serve o build, emite JWTs do LiveKit e guarda
// somente estado efemero de sala (host/PIN/preset/apresentador + arquivos temporarios).

const http = require("http");
const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const API_KEY = process.env.LIVEKIT_API_KEY || "";
const API_SECRET = process.env.LIVEKIT_API_SECRET || "";
const WSS_URL = process.env.PUBLIC_WSS_URL || "";
const API_URL = (process.env.LIVEKIT_API_URL
  || WSS_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:")).replace(/\/+$/, "");
const MAX_ROOMS = parseInt(process.env.MAX_ROOMS || "5", 10);
const TOKENS_POR_SEG = parseInt(process.env.TOKENS_POR_SEG || "40", 10);
const PORT = parseInt(process.env.PORT || "3000", 10);
const DIST = path.join(__dirname, "dist");
const SHARE_MAX_MB = Math.max(1, Math.min(20, parseInt(process.env.SHARE_MAX_MB || "8", 10)));
const SHARE_TOTAL_MB = Math.max(SHARE_MAX_MB, Math.min(128, parseInt(process.env.SHARE_TOTAL_MB || "32", 10)));
const SHARE_TTL_MS = Math.max(5, Math.min(180, parseInt(process.env.SHARE_TTL_MIN || "60", 10))) * 60 * 1000;
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

function getRoomConfig(room, create = false, requestedPreset = "livre") {
  let config = roomConfigs.get(room);
  if (!config && create) {
    config = {
      createdAt: Date.now(), touchedAt: Date.now(),
      hostClaim: randomKey(24), hostIdentity: "",
      pinSalt: "", pinHash: "",
      preset: PRESETS.has(requestedPreset) ? requestedPreset : "livre",
      presenter: null,
      permissions: new Map()
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
async function canEnter(room) {
  try {
    const rooms = await listRooms();
    const exists = rooms.some((item) => item.name === room);
    return exists || rooms.length < MAX_ROOMS;
  } catch (e) {
    console.warn("Nao consegui checar limite (deixando entrar):", e.message);
    return true;
  }
}

let tokenWindow = { sec: 0, count: 0 };
function tokenAllowed() {
  const sec = Math.floor(Date.now() / 1000);
  if (sec !== tokenWindow.sec) tokenWindow = { sec, count: 0 };
  tokenWindow.count += 1;
  return tokenWindow.count <= TOKENS_POR_SEG;
}

const ALERTA_WEBHOOK = process.env.ALERTA_WEBHOOK || "";
const ALERTA_MBPS = parseInt(process.env.ALERTA_MBPS || "250", 10);
const BITRATE_MBPS = parseFloat(process.env.BITRATE_MBPS || "6");
let ultimoAlerta = 0;
function avisarDiscord(texto) {
  let url; try { url = new URL(ALERTA_WEBHOOK); } catch (e) { return; }
  const body = JSON.stringify({ content: texto });
  const request = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (r) => r.resume());
  request.on("error", () => {});
  request.setTimeout(4000, () => request.destroy());
  request.write(body); request.end();
}
async function vigiaBanda() {
  try {
    const rooms = await listRoomsReal();
    let mbps = 0, people = 0, publishers = 0;
    rooms.forEach((room) => {
      const participants = room.num_participants || 0;
      const pubs = room.num_publishers || 0;
      people += participants; publishers += pubs;
      mbps += pubs * Math.max(0, participants - 1) * BITRATE_MBPS;
    });
    if (mbps >= ALERTA_MBPS && Date.now() - ultimoAlerta > 10 * 60 * 1000) {
      ultimoAlerta = Date.now();
      avisarDiscord("[ALERTA] Mazestream puxando ~" + Math.round(mbps) + " Mbps agora ("
        + rooms.length + " salas, " + people + " pessoas, " + publishers + " transmissoes). O servidor e' o mesmo do RPG, fica de olho.");
    }
  } catch (e) {}
}
if (ALERTA_WEBHOOK && API_URL) setInterval(vigiaBanda, 30000).unref();

function json(res, code, value) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}
function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        reject(Object.assign(new Error("corpo grande"), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => { if (!tooLarge) resolve(Buffer.concat(chunks)); });
    req.on("error", reject);
  });
}
async function readJson(req, maxBytes = 64 * 1024) {
  const body = await readBody(req, maxBytes);
  if (!body.length) return {};
  return JSON.parse(body.toString("utf8"));
}
function serveFile(res, filePath) {
  fs.readFile(filePath, (err, buffer) => {
    if (err) { res.writeHead(404); res.end("nao encontrado"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    res.end(buffer);
  });
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

  if (!(await canEnter(room))) {
    json(res, 429, { error: "limite", motivo: "Servidor cheio: ja tem " + MAX_ROOMS + " salas abertas. Espere uma esvaziar ou entre numa sala que ja existe." });
    return;
  }

  let config = getRoomConfig(room, false);
  const newRoomState = !config;
  if (!config) config = getRoomConfig(room, true, requestedPreset);

  const validHostClaim = !newRoomState && !!hostClaim && hostClaim === config.hostClaim;
  if (!newRoomState && !validHostClaim && !checkPin(config, requestedPin)) {
    json(res, 403, { error: "pin", motivo: requestedPin ? "PIN incorreto." : "Esta sala está bloqueada. Informe o PIN." });
    return;
  }

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
  if (!session.isHost) { json(res, 403, { error: "host", motivo: "Só o host pode fazer isso." }); return; }
  const config = getRoomConfig(session.room, false);
  if (!config) { json(res, 404, { error: "room" }); return; }

  const body = await readJson(req);
  const action = String(body.action || "");
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
  } else {
    json(res, 400, { error: "action" });
    return;
  }
  config.touchedAt = Date.now();
  json(res, 200, { ok: true, roomState: publicRoomState(config) });
}

async function handleShare(req, res, url) {
  if (req.method !== "POST") { res.writeHead(405); res.end("metodo"); return; }
  const session = getSession(req);
  if (!session) { json(res, 401, { error: "session", motivo: "Sessão expirada." }); return; }
  const maxBytes = SHARE_MAX_MB * 1024 * 1024;
  let buffer;
  try { buffer = await readBody(req, maxBytes); }
  catch (e) { json(res, e.statusCode || 400, { error: "arquivo", motivo: "Arquivo grande demais. Limite: " + SHARE_MAX_MB + " MB." }); return; }
  if (!buffer.length) { json(res, 400, { error: "arquivo", motivo: "Arquivo vazio." }); return; }
  cleanupEphemeral();
  if (sharedBytes + buffer.length > SHARE_TOTAL_MB * 1024 * 1024) {
    json(res, 507, { error: "limite", motivo: "O espaço temporário de arquivos está cheio. Tente novamente mais tarde." });
    return;
  }
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
}

function handleSharedFile(req, res, id) {
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
  res.end(file.buffer);
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
  const filePath = path.join(DIST, rel);
  if (!filePath.startsWith(DIST)) { res.writeHead(403); res.end("proibido"); return; }
  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) { serveFile(res, filePath); return; }
    serveFile(res, path.join(DIST, "index.html"));
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
server.listen(PORT, "0.0.0.0", () => {
  console.log("Mazestream na porta " + PORT + " | max salas: " + MAX_ROOMS + " | /token/s: " + TOKENS_POR_SEG
    + " | upload temporario: " + SHARE_MAX_MB + " MB | API: " + (API_URL || "nao configurada"));
});
