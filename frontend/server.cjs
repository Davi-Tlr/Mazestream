// Servidor do Mazestream: serve o build e emite os tokens do LiveKit.
// Node puro, sem dependencias. Token = JWT HS256 assinado com o API Secret.
//
// Endurecido contra flood/DoS: parsing a prova de crash, rate limit global,
// cache do ListRooms (evita amplificar flood pra dentro do LiveKit) e timeouts.
//
// Variaveis de ambiente:
//   LIVEKIT_API_KEY, LIVEKIT_API_SECRET   obrigatorios
//   PUBLIC_WSS_URL       ex: wss://seunome.duckdns.org
//   LIVEKIT_API_URL      opcional. HTTP(S) da API do LiveKit. Padrao: deriva do WSS.
//   MAX_ROOMS            maximo de salas simultaneas (padrao 5)
//   TOKENS_POR_SEG       teto global de /token por segundo (padrao 40)
//   PORT                 padrao 3000

const http = require("http");
const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const API_KEY = process.env.LIVEKIT_API_KEY || "";
const API_SECRET = process.env.LIVEKIT_API_SECRET || "";
const WSS_URL = process.env.PUBLIC_WSS_URL || "";
const MAX_ROOMS = parseInt(process.env.MAX_ROOMS || "5", 10);
const TOKENS_POR_SEG = parseInt(process.env.TOKENS_POR_SEG || "40", 10);
const PORT = parseInt(process.env.PORT || "3000", 10);
const DIST = path.join(__dirname, "dist");
const API_URL = (process.env.LIVEKIT_API_URL
  || WSS_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:")).replace(/\/+$/, "");

if (!API_KEY || !API_SECRET) {
  console.error("LIVEKIT_API_KEY / LIVEKIT_API_SECRET nao definidos.");
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript",
  ".mjs": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff": "font/woff",
  ".woff2": "font/woff2", ".map": "application/json"
};

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function assinar(payload) {
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac("sha256", API_SECRET).update(h + "." + p).digest());
  return h + "." + p + "." + sig;
}
function tokenDeEntrada(identity, name, room) {
  const now = Math.floor(Date.now() / 1000);
  return assinar({
    iss: API_KEY, sub: identity, name: name || identity,
    nbf: now, exp: now + 6 * 3600, jti: identity + "-" + now,
    video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true, canUpdateOwnMetadata: true }
  });
}
function tokenDeAdmin() {
  const now = Math.floor(Date.now() / 1000);
  return assinar({ iss: API_KEY, sub: "mazestream-admin", nbf: now, exp: now + 60, video: { roomList: true } });
}

// ---- Cache do ListRooms: no maximo 1 chamada real a cada CACHE_MS, mesmo sob flood.
let cacheSalas = { quando: 0, dados: null, promessa: null };
const CACHE_MS = 3000;

function listarSalasReal() {
  return new Promise((resolve, reject) => {
    let alvo;
    try { alvo = new URL(API_URL + "/twirp/livekit.RoomService/ListRooms"); }
    catch (e) { return reject(e); }
    const mod = alvo.protocol === "https:" ? https : http;
    const corpo = "{}";
    const req = mod.request({
      hostname: alvo.hostname, port: alvo.port || (alvo.protocol === "https:" ? 443 : 80),
      path: alvo.pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tokenDeAdmin(), "Content-Length": Buffer.byteLength(corpo) }
    }, (res) => {
      let dados = "";
      res.on("data", (c) => { dados += c; if (dados.length > 1e6) req.destroy(new Error("resposta grande")); });
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error("ListRooms HTTP " + res.statusCode));
        try { resolve(JSON.parse(dados).rooms || []); } catch (e) { reject(e); }
      });
    });
    req.setTimeout(2500, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(corpo); req.end();
  });
}
function listarSalas() {
  const agora = Date.now();
  if (cacheSalas.dados && agora - cacheSalas.quando < CACHE_MS) return Promise.resolve(cacheSalas.dados);
  if (cacheSalas.promessa) return cacheSalas.promessa;
  cacheSalas.promessa = listarSalasReal().then((salas) => {
    cacheSalas = { quando: Date.now(), dados: salas, promessa: null };
    return salas;
  }).catch((e) => { cacheSalas.promessa = null; throw e; });
  return cacheSalas.promessa;
}
async function permiteEntrar(room) {
  try {
    const salas = await listarSalas();
    const existe = salas.some((s) => s.name === room);
    if (!existe && salas.length >= MAX_ROOMS) return false;
    return true;
  } catch (e) {
    console.warn("Nao consegui checar limite (deixando entrar):", e.message);
    return true; // falha aberta: erro de rede nao trava todo mundo
  }
}

// ---- Rate limit global de /token (bounde a amplificacao e a CPU sob flood).
let janela = { seg: 0, n: 0 };
function tokenPermitido() {
  const seg = Math.floor(Date.now() / 1000);
  if (seg !== janela.seg) janela = { seg, n: 0 };
  janela.n += 1;
  return janela.n <= TOKENS_POR_SEG;
}

// ---- Vigia de banda: estima o egress atual e avisa no Discord se passar do teto.
// Egress ~= para cada sala, publicadores x (participantes-1) x bitrate por stream.
// So liga se ALERTA_WEBHOOK estiver definido.
const ALERTA_WEBHOOK = process.env.ALERTA_WEBHOOK || "";
const ALERTA_MBPS = parseInt(process.env.ALERTA_MBPS || "250", 10);
const BITRATE_MBPS = parseFloat(process.env.BITRATE_MBPS || "6");
let ultimoAlerta = 0;

function avisarDiscord(texto) {
  let u; try { u = new URL(ALERTA_WEBHOOK); } catch (e) { return; }
  const body = JSON.stringify({ content: texto });
  const req = https.request({
    hostname: u.hostname, path: u.pathname + u.search, method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
  }, (r) => r.resume());
  req.on("error", () => {});
  req.setTimeout(4000, () => req.destroy());
  req.write(body); req.end();
}

async function vigiaBanda() {
  try {
    const salas = await listarSalasReal();
    let mbps = 0, pessoas = 0, telas = 0;
    salas.forEach((s) => {
      const part = s.num_participants || 0;
      const pub = s.num_publishers || 0;
      pessoas += part; telas += pub;
      mbps += pub * Math.max(0, part - 1) * BITRATE_MBPS;
    });
    const agora = Date.now();
    if (mbps >= ALERTA_MBPS && agora - ultimoAlerta > 10 * 60 * 1000) {
      ultimoAlerta = agora;
      avisarDiscord("[ALERTA] Mazestream puxando ~" + Math.round(mbps) + " Mbps agora ("
        + salas.length + " salas, " + pessoas + " pessoas, " + telas + " transmissoes). "
        + "O servidor e' o mesmo do RPG, fica de olho.");
    }
  } catch (e) { /* falha aberta: nao avisa, nao quebra */ }
}
if (ALERTA_WEBHOOK) {
  setInterval(vigiaBanda, 30000);
  console.log("Vigia de banda ligado: alerta acima de " + ALERTA_MBPS + " Mbps.");
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); res.end("nao encontrado"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    res.end(buf);
  });
}
function json(res, code, obj) { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); }

async function handler(req, res) {
  // Limite duro no tamanho da URL (linha de request gigante = lixo).
  if (!req.url || req.url.length > 2048) { res.writeHead(414); res.end("uri grande"); return; }

  let u;
  try { u = new URL(req.url, "http://localhost"); } catch (e) { res.writeHead(400); res.end("url invalida"); return; }

  if (u.pathname === "/token") {
    if (req.method !== "GET") { res.writeHead(405); res.end("metodo"); return; }
    if (!tokenPermitido()) { json(res, 429, { error: "flood", motivo: "Muitas requisicoes agora. Tente de novo em instantes." }); return; }

    const room = (u.searchParams.get("room") || "sala").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "sala";
    const name = (u.searchParams.get("name") || "convidado").replace(/[ -]/g, "").slice(0, 40);

    if (!(await permiteEntrar(room))) {
      json(res, 429, { error: "limite", motivo: "Servidor cheio: ja tem " + MAX_ROOMS + " salas abertas. Espere uma esvaziar ou entre numa sala que ja existe." });
      return;
    }
    const identity = (name.replace(/[^a-zA-Z0-9_-]/g, "") || "convidado") + "-" + crypto.randomBytes(3).toString("hex");
    json(res, 200, { token: tokenDeEntrada(identity, name, room), url: WSS_URL, identity });
    return;
  }

  // Estaticos do build; fora isso, index.html (SPA). Bloqueia path traversal.
  let rel;
  try { rel = path.normalize(decodeURIComponent(u.pathname)); }
  catch (e) { rel = "/index.html"; } // URI malformada nao derruba o servidor
  rel = rel.replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(DIST, rel);
  if (!filePath.startsWith(DIST)) { res.writeHead(403); res.end("proibido"); return; }
  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) { serveFile(res, filePath); return; }
    serveFile(res, path.join(DIST, "index.html"));
  });
}

const server = http.createServer((req, res) => {
  // Nada que aconteca num request pode derrubar o processo.
  Promise.resolve().then(() => handler(req, res)).catch((e) => {
    console.error("Erro no handler:", e && e.message);
    try { res.writeHead(500); res.end("erro"); } catch (x) {}
  });
});

// Timeouts contra conexoes lentas (slowloris) e requests presos.
server.requestTimeout = 10000;
server.headersTimeout = 8000;
server.keepAliveTimeout = 8000;
server.on("connection", (s) => s.setTimeout(15000, () => s.destroy()));

server.listen(PORT, "0.0.0.0", () => console.log("Mazestream na porta " + PORT + " | max salas: " + MAX_ROOMS + " | teto /token/s: " + TOKENS_POR_SEG + " | API: " + API_URL));
