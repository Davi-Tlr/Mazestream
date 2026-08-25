// Servidor de token para desenvolvimento local.
// Versao leve do server.cjs: sem rate limit, sem limite de salas,
// sem checagem de ListRooms. aceita qualquer API key/secret.
//
// Uso: node dev-server.cjs
// Porta padrao: 3001 (configuravel via PORT)
//
// Variaveis de ambiente (todas opcionais - valores padrao para dev):
//   LIVEKIT_API_KEY      padrao: devkey
//   LIVEKIT_API_SECRET   padrao: devsecret
//   PUBLIC_WSS_URL       padrao: ws://localhost:7880
//   PORT                 padrao: 3001

const http = require("http");
const crypto = require("crypto");
const { URL } = require("url");

const API_KEY = process.env.LIVEKIT_API_KEY || "devkey";
const API_SECRET = process.env.LIVEKIT_API_SECRET || "devsecret";
const WSS_URL = process.env.PUBLIC_WSS_URL || "ws://localhost:7880";
const PORT = parseInt(process.env.PORT || "3001", 10);

console.log("[dev-server] LIVEKIT_API_KEY:", API_KEY);
console.log("[dev-server] LIVEKIT_API_SECRET:", API_SECRET.slice(0, 4) + "****");
console.log("[dev-server] PUBLIC_WSS_URL:", WSS_URL);

function b64url(input) {
  return Buffer.from(input).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function assinar(payload) {
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify(payload));
  const sig = b64url(
    crypto.createHmac("sha256", API_SECRET).update(h + "." + p).digest()
  );
  return h + "." + p + "." + sig;
}

function gerarToken(identity, name, room) {
  const now = Math.floor(Date.now() / 1000);
  return assinar({
    iss: API_KEY,
    sub: identity,
    name: name || identity,
    nbf: now,
    exp: now + 6 * 3600,
    jti: identity + "-" + now,
    video: {
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
    },
  });
}

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  // CORS headers para o Vite dev server
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  let u;
  try {
    u = new URL(req.url, "http://localhost");
  } catch (e) {
    json(res, 400, { error: "url invalida" });
    return;
  }

  if (u.pathname === "/token") {
    const room = (u.searchParams.get("room") || "sala-dev")
      .replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "sala-dev";
    const rawName = (u.searchParams.get("name") || "dev").trim().slice(0, 40) || "dev";
    const name = rawName.replace(/[\r\n\t]/g, " ");
    const safeId = rawName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]/g, "") || "dev";
    const identity = safeId + "-" + crypto.randomBytes(3).toString("hex");

    const token = gerarToken(identity, name, room);

    console.log("[dev-token] room=" + room + " name=" + name + " identity=" + identity);

    json(res, 200, { token, url: WSS_URL, identity });
    return;
  }

  json(res, 404, { error: "rota nao encontrada. use /token?room=X&name=Y" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("[dev-server] Rodando em http://127.0.0.1:" + PORT);
  console.log("[dev-server] Token endpoint: http://127.0.0.1:" + PORT + "/token?room=sala&name=teste");
  console.log("[dev-server] Apontando para LiveKit: " + WSS_URL);
});
