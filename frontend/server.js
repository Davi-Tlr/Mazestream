// Servidor do frontend: serve a pagina e emite os tokens do LiveKit.
// Node puro, sem dependencias. O token e um JWT HS256 assinado com o API Secret.
//
// Variaveis de ambiente:
//   LIVEKIT_API_KEY      obrigatorio
//   LIVEKIT_API_SECRET   obrigatorio
//   PUBLIC_WSS_URL       ex: wss://livekit.exemplo.com
//   PORT                 padrao 3000

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const API_KEY = process.env.LIVEKIT_API_KEY || "";
const API_SECRET = process.env.LIVEKIT_API_SECRET || "";
const WSS_URL = process.env.PUBLIC_WSS_URL || "";
const PORT = parseInt(process.env.PORT || "3000", 10);

if (!API_KEY || !API_SECRET) {
  console.error("LIVEKIT_API_KEY / LIVEKIT_API_SECRET nao definidos.");
  process.exit(1);
}

function b64url(input) {
  return Buffer.from(input).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeToken(identity, name, room) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: API_KEY,
    sub: identity,
    name: name || identity,
    nbf: now,
    exp: now + 6 * 3600,
    jti: identity + "-" + now,
    video: {
      room: room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac("sha256", API_SECRET).update(h + "." + p).digest());
  return h + "." + p + "." + sig;
}

const INDEX = fs.readFileSync(path.join(__dirname, "index.html"));

// arquivos estaticos servidos por caminho
const STATIC = {
  "/manifest.webmanifest": { file: "manifest.webmanifest", type: "application/manifest+json" },
  "/sw.js": { file: "sw.js", type: "application/javascript" },
  "/icon-192.png": { file: "icon-192.png", type: "image/png" },
  "/icon-512.png": { file: "icon-512.png", type: "image/png" },
};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");

  if (STATIC[u.pathname]) {
    try {
      const s = STATIC[u.pathname];
      const buf = fs.readFileSync(path.join(__dirname, s.file));
      res.writeHead(200, { "Content-Type": s.type });
      res.end(buf);
    } catch (e) {
      res.writeHead(404); res.end("nao encontrado");
    }
    return;
  }

  if (u.pathname === "/token") {
    const room = (u.searchParams.get("room") || "sala").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "sala";
    const name = (u.searchParams.get("name") || "convidado").slice(0, 40);
    const identity = name.replace(/[^a-zA-Z0-9_-]/g, "") + "-" + crypto.randomBytes(3).toString("hex");
    const token = makeToken(identity, name, room);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ token, url: WSS_URL, identity }));
    return;
  }

  if (u.pathname === "/config.js") {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end('window.LIVEKIT_URL=' + JSON.stringify(WSS_URL) + ';');
    return;
  }

  // qualquer outra rota serve a pagina
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(INDEX);
});

server.listen(PORT, "0.0.0.0", () => console.log("Frontend na porta " + PORT));
