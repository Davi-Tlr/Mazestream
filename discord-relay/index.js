// Relay de eventos e monitor de banda do Mazestream para o Discord.
// Funciona só com webhook para avisos automáticos. Com as credenciais opcionais
// do Discord App também registra e atende o slash command /banda.

const http = require("http");
const https = require("https");
const crypto = require("crypto");
const { URL } = require("url");
const {
  formatBytes, packetCounterRates, parsePacketByteCounters, summarizeRooms
} = require("./bandwidth.cjs");

function boundedNumber(name, fallback, min, max, integer = false) {
  const parsed = integer
    ? Number.parseInt(process.env[name] || "", 10)
    : Number.parseFloat(process.env[name] || "");
  if (!Number.isFinite(parsed)) return fallback;
  const value = integer ? Math.round(parsed) : parsed;
  return Math.max(min, Math.min(max, value));
}

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID || "";
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY || "";
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || "";
const PUBLIC_URL = process.env.PUBLIC_URL || "";
const PORT = boundedNumber("PORT", 8080, 1, 65535, true);

const API_KEY = process.env.LIVEKIT_API_KEY || "";
const API_SECRET = process.env.LIVEKIT_API_SECRET || "";
const WSS_URL = process.env.PUBLIC_WSS_URL || "";
const API_URL = (process.env.LIVEKIT_API_URL
  || WSS_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:")).replace(/\/+$/, "");
const METRICS_URL = process.env.LIVEKIT_METRICS_URL || "http://host.docker.internal:6789/metrics";
const ALERTA_MBPS = boundedNumber("ALERTA_MBPS", 120, 1, 100000);
const MONITOR_INTERVAL_MS = boundedNumber("BANDWIDTH_INTERVAL_SECONDS", 30, 15, 3600, true) * 1000;
const ALERT_COOLDOWN_MS = boundedNumber("BANDWIDTH_ALERT_COOLDOWN_MINUTES", 10, 2, 1440, true) * 60 * 1000;
const BITRATE_DEFAULTS = {
  screenShareMbps: boundedNumber("SCREEN_SHARE_MBPS", 5, 0.1, 1000),
  cameraMbps: boundedNumber("CAMERA_MBPS", 2.5, 0.1, 1000),
  audioMbps: boundedNumber("AUDIO_MBPS", 0.128, 0.01, 100)
};

if (!DISCORD_WEBHOOK_URL && !(DISCORD_APPLICATION_ID && DISCORD_PUBLIC_KEY)) {
  console.error("Configure DISCORD_WEBHOOK_URL ou as credenciais do Discord App.");
  process.exit(1);
}
if (!API_KEY || !API_SECRET || !API_URL) {
  console.error("LIVEKIT_API_KEY, LIVEKIT_API_SECRET e PUBLIC_WSS_URL/LIVEKIT_API_URL são obrigatórios para o monitor de banda.");
  process.exit(1);
}

const COLOR = { green: 5763719, blue: 3447003, orange: 15105570, red: 15548997, gray: 9807270 };

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const signature = b64url(crypto.createHmac("sha256", API_SECRET).update(header + "." + body).digest());
  return header + "." + body + "." + signature;
}
function adminToken(grant) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({ iss: API_KEY, sub: "mazestream-bandwidth", nbf: now, exp: now + 60, video: grant });
}
function listToken() { return adminToken({ roomList: true }); }
function roomToken(room) { return adminToken({ room: room, roomAdmin: true }); }

function requestJson(target, options, payload) {
  return new Promise((resolve, reject) => {
    const url = target instanceof URL ? target : new URL(target);
    const mod = url.protocol === "https:" ? https : http;
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const headers = Object.assign({ "User-Agent": "Mazestream/1.0" }, options.headers || {});
    if (body) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(body);
    }
    const request = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || "GET",
      headers: headers
    }, (response) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
        if (data.length > 2e6) request.destroy(new Error("resposta grande"));
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error((options.label || "HTTP") + " " + response.statusCode + " " + data.slice(0, 300)));
          return;
        }
        if (!data) { resolve({}); return; }
        try { resolve(JSON.parse(data)); } catch (error) { resolve({}); }
      });
    });
    request.setTimeout(options.timeout || 4000, () => request.destroy(new Error("timeout")));
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

function requestText(target, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const url = target instanceof URL ? target : new URL(target);
    const mod = url.protocol === "https:" ? https : http;
    const request = mod.get({
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search
    }, (response) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
        if (data.length > 8e6) request.destroy(new Error("metricas grandes"));
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error("Prometheus HTTP " + response.statusCode));
          return;
        }
        resolve(data);
      });
    });
    request.setTimeout(timeout, () => request.destroy(new Error("timeout")));
    request.on("error", reject);
  });
}

function twirp(method, token, body) {
  return requestJson(new URL(API_URL + "/twirp/livekit.RoomService/" + method), {
    method: "POST",
    timeout: 3500,
    label: method,
    headers: { Authorization: "Bearer " + token }
  }, body || {});
}

function discordApi(path, method, payload) {
  return requestJson(new URL("https://discord.com/api/v10" + path), {
    method: method,
    timeout: 5000,
    label: "Discord",
    headers: DISCORD_BOT_TOKEN ? { Authorization: "Bot " + DISCORD_BOT_TOKEN } : {}
  }, payload);
}

function postToDiscord(embed) {
  if (!DISCORD_WEBHOOK_URL) return Promise.resolve();
  return requestJson(new URL(DISCORD_WEBHOOK_URL), {
    method: "POST",
    timeout: 5000,
    label: "Discord webhook"
  }, { embeds: [embed] }).catch((error) => {
    console.error("Erro postando no Discord:", error.message);
  });
}

function embedForEvent(event) {
  const room = event.room && event.room.name ? event.room.name : "sala";
  const who = event.participant && event.participant.name
    ? event.participant.name
    : (event.participant && event.participant.identity ? event.participant.identity : "alguém");
  const base = { footer: { text: "LiveKit" }, timestamp: new Date().toISOString() };
  if (PUBLIC_URL) base.url = PUBLIC_URL;

  switch (event.event) {
    case "room_started":
      return Object.assign({ title: "🟢 Sala aberta", color: COLOR.green,
        description: "A sala **" + room + "** está aberta.",
        fields: PUBLIC_URL ? [{ name: "Entrar", value: PUBLIC_URL }] : [] }, base);
    case "participant_joined":
      return Object.assign({ title: "👋 Entrou na sala", color: COLOR.blue,
        description: "**" + who + "** entrou em **" + room + "**." }, base);
    case "track_published":
      if (event.track && event.track.source !== "SCREEN_SHARE" && event.track.source !== 3) return null;
      return Object.assign({ title: "🔴 Transmissão ao vivo", color: COLOR.red,
        description: "**" + who + "** começou a compartilhar em **" + room + "**.",
        fields: PUBLIC_URL ? [{ name: "Assistir", value: PUBLIC_URL }] : [] }, base);
    case "participant_left":
      return Object.assign({ title: "Saiu da sala", color: COLOR.gray,
        description: "**" + who + "** saiu de **" + room + "**." }, base);
    case "room_finished":
      return Object.assign({ title: "Sala encerrada", color: COLOR.gray,
        description: "A sala **" + room + "** foi encerrada." }, base);
    default:
      return null;
  }
}

const monitorStartedAt = Date.now();
let latestSnapshot = null;
let refreshPromise = null;
let lastSampleAt = 0;
let estimatedEgressBytes = 0;
let lastMetrics = null;
let metricsBaseline = null;
let metricsPeriodStartedAt = monitorStartedAt;
let lastMetricsWarningAt = 0;
let alertActive = false;
let lastAlertAt = 0;

async function refreshBandwidth() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const metricsPromise = requestText(METRICS_URL).then((text) => parsePacketByteCounters(text)).catch((error) => {
      if (Date.now() - lastMetricsWarningAt > 10 * 60 * 1000) {
        lastMetricsWarningAt = Date.now();
        console.warn("Prometheus indisponível; usando estimativa de faixas:", error.message);
      }
      return null;
    });
    const roomResult = await twirp("ListRooms", listToken(), {});
    const rooms = roomResult.rooms || [];
    const participantResults = await Promise.all(rooms.map(async (room) => {
      const result = await twirp("ListParticipants", roomToken(room.name), { room: room.name });
      return [room.name, result.participants || []];
    }));
    const summary = summarizeRooms(rooms, new Map(participantResults), BITRATE_DEFAULTS);
    const now = Date.now();
    const counters = await metricsPromise;
    if (latestSnapshot && lastSampleAt) {
      const seconds = Math.min((now - lastSampleAt) / 1000, MONITOR_INTERVAL_MS / 1000 * 2.5);
      const averageMbps = (latestSnapshot.egressMbps + summary.egressMbps) / 2;
      estimatedEgressBytes += averageMbps * 1_000_000 / 8 * Math.max(0, seconds);
    }
    let measuredRate = null;
    let measuredEgressBytes = null;
    if (counters) {
      const currentMetrics = { at: now, incoming: counters.incoming, outgoing: counters.outgoing };
      if (!metricsBaseline
        || currentMetrics.incoming < metricsBaseline.incoming
        || currentMetrics.outgoing < metricsBaseline.outgoing) {
        metricsBaseline = currentMetrics;
        metricsPeriodStartedAt = now;
      }
      measuredRate = packetCounterRates(lastMetrics, currentMetrics);
      lastMetrics = currentMetrics;
      measuredEgressBytes = Math.max(0, currentMetrics.outgoing - metricsBaseline.outgoing);
    }
    lastSampleAt = now;
    latestSnapshot = Object.assign(summary, {
      estimatedIngressMbps: summary.ingressMbps,
      estimatedEgressMbps: summary.egressMbps,
      ingressMbps: measuredRate?.ingressMbps ?? summary.ingressMbps,
      egressMbps: measuredRate?.egressMbps ?? summary.egressMbps,
      measured: !!measuredRate,
      sampledAt: now,
      monitorStartedAt: monitorStartedAt,
      trafficPeriodStartedAt: measuredEgressBytes === null ? monitorStartedAt : metricsPeriodStartedAt,
      egressBytes: measuredEgressBytes ?? estimatedEgressBytes
    });
    return latestSnapshot;
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

function formatMbps(value) {
  const number = Math.max(0, Number(value) || 0);
  return number >= 100 ? Math.round(number).toString() : number.toFixed(number >= 10 ? 1 : 2);
}

function bandwidthEmbed(snapshot, title, color) {
  const perHour = snapshot.egressMbps * 1_000_000 / 8 * 3600;
  const roomLines = snapshot.rooms.length
    ? snapshot.rooms.map((room) => (
      "**" + room.name + "** · " + room.participants + " pessoas · "
      + room.screens + " telas · ~" + formatMbps(room.egressMbps) + " Mbps saída"
    )).join("\n").slice(0, 1000)
    : "Nenhuma sala ativa.";
  return {
    title: title,
    color: color,
    description: snapshot.measured
      ? "Total medido nos contadores reais de pacotes do LiveKit. A divisão por sala continua estimada pelas faixas publicadas."
      : "Prometheus ainda não entregou duas amostras; usando temporariamente a estimativa de faixas, espectadores, Adaptive Stream e Dynacast.",
    fields: [
      { name: "Agora", value: "⬆️ Entrada no SFU: **~" + formatMbps(snapshot.ingressMbps) + " Mbps**\n⬇️ Saída do SFU: **~" + formatMbps(snapshot.egressMbps) + " Mbps**", inline: true },
      { name: "Ritmo", value: "**~" + formatBytes(perHour) + "/h**\nAlerta em " + formatMbps(ALERTA_MBPS) + " Mbps", inline: true },
      { name: "Atividade", value: snapshot.participants + " pessoas · " + snapshot.publications + " faixas\n" + snapshot.screens + " telas · " + snapshot.cameras + " câmeras", inline: true },
      { name: "Por sala (estimado)", value: roomLines },
      { name: snapshot.measured ? "Saída medida no período" : "Saída estimada no período", value: formatBytes(snapshot.egressBytes) + " desde " + new Date(snapshot.trafficPeriodStartedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) }
    ],
    footer: { text: snapshot.measured ? "Mazestream · /banda · bytes reais do SFU" : "Mazestream · /banda · fallback estimado" },
    timestamp: new Date(snapshot.sampledAt).toISOString()
  };
}

async function monitorBandwidth() {
  try {
    const snapshot = await refreshBandwidth();
    const now = Date.now();
    if (snapshot.egressMbps >= ALERTA_MBPS) {
      if (!alertActive || now - lastAlertAt >= ALERT_COOLDOWN_MS) {
        alertActive = true;
        lastAlertAt = now;
        await postToDiscord(bandwidthEmbed(snapshot, "⚠️ Banda alta no Mazestream", COLOR.orange));
      }
    } else if (alertActive && snapshot.egressMbps < ALERTA_MBPS * 0.8) {
      alertActive = false;
      await postToDiscord(bandwidthEmbed(snapshot, "✅ Banda voltou ao normal", COLOR.green));
    }
  } catch (error) {
    console.error("Falha no monitor de banda:", error.message);
  }
}

function interactionPublicKey() {
  if (!/^[a-f0-9]{64}$/i.test(DISCORD_PUBLIC_KEY)) return null;
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  return crypto.createPublicKey({
    key: Buffer.concat([prefix, Buffer.from(DISCORD_PUBLIC_KEY, "hex")]),
    format: "der",
    type: "spki"
  });
}
const discordVerifyKey = interactionPublicKey();

function validDiscordSignature(req, body) {
  if (!discordVerifyKey) return false;
  const signature = String(req.headers["x-signature-ed25519"] || "");
  const timestamp = String(req.headers["x-signature-timestamp"] || "");
  if (!/^[a-f0-9]{128}$/i.test(signature) || !/^\d+$/.test(timestamp)) return false;
  const age = Math.abs(Date.now() - Number(timestamp) * 1000);
  if (!Number.isFinite(age) || age > 5 * 60 * 1000) return false;
  try {
    return crypto.verify(null, Buffer.concat([Buffer.from(timestamp), body]), discordVerifyKey, Buffer.from(signature, "hex"));
  } catch (error) {
    return false;
  }
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
  res.end(body);
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("payload grande"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleInteraction(req, res, body) {
  if (!validDiscordSignature(req, body)) {
    sendJson(res, 401, { error: "invalid request signature" });
    return;
  }
  let interaction;
  try { interaction = JSON.parse(body.toString("utf8")); }
  catch (error) { sendJson(res, 400, { error: "invalid json" }); return; }

  if (interaction.type === 1) {
    sendJson(res, 200, { type: 1 });
    return;
  }
  if (interaction.type !== 2 || interaction.data?.name !== "banda") {
    sendJson(res, 200, { type: 4, data: { content: "Comando não reconhecido.", flags: 64 } });
    return;
  }

  let snapshot = latestSnapshot;
  if (snapshot && Date.now() - snapshot.sampledAt > MONITOR_INTERVAL_MS * 2) {
    // O Discord exige a resposta inicial rapidamente. Entrega o último retrato
    // conhecido e atualiza em segundo plano, em vez de bloquear em chamadas ao SFU.
    void refreshBandwidth().catch(() => {});
  }
  if (!snapshot) {
    sendJson(res, 200, { type: 4, data: { content: "Ainda não consegui consultar o LiveKit. Tente novamente em alguns segundos.", flags: 64 } });
    return;
  }
  sendJson(res, 200, { type: 4, data: { embeds: [bandwidthEmbed(snapshot, "📊 Banda do Mazestream", COLOR.blue)] } });
}

async function registerBandwidthCommand() {
  if (!DISCORD_APPLICATION_ID || !DISCORD_PUBLIC_KEY || !DISCORD_BOT_TOKEN) {
    if (DISCORD_APPLICATION_ID || DISCORD_PUBLIC_KEY || DISCORD_BOT_TOKEN) {
      console.warn("Discord App incompleto: /banda precisa de Application ID, Public Key e Bot Token.");
    }
    return;
  }
  if (!/^\d+$/.test(DISCORD_APPLICATION_ID) || (DISCORD_GUILD_ID && !/^\d+$/.test(DISCORD_GUILD_ID))) {
    console.error("Application ID/Guild ID do Discord inválido; /banda não foi registrado.");
    return;
  }
  const base = "/applications/" + DISCORD_APPLICATION_ID;
  const path = DISCORD_GUILD_ID
    ? base + "/guilds/" + DISCORD_GUILD_ID + "/commands"
    : base + "/commands";
  const command = {
    name: "banda",
    type: 1,
    description: "Mostra o uso de banda atual do Mazestream"
  };
  try {
    const commands = await discordApi(path, "GET");
    const existing = Array.isArray(commands) ? commands.find((item) => item && item.name === command.name) : null;
    if (existing && /^\d+$/.test(String(existing.id || ""))) {
      await discordApi(path + "/" + existing.id, "PATCH", command);
      console.log("Comando /banda atualizado" + (DISCORD_GUILD_ID ? " na guild configurada." : " globalmente."));
    } else {
      await discordApi(path, "POST", command);
      console.log("Comando /banda registrado" + (DISCORD_GUILD_ID ? " na guild configurada." : " globalmente."));
    }
  } catch (error) {
    console.error("Não consegui registrar /banda:", error.message);
  }
}

const server = http.createServer((req, res) => {
  Promise.resolve().then(async () => {
    const url = new URL(req.url || "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true, bandwidthSampledAt: latestSnapshot?.sampledAt || null });
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(200); res.end("ok"); return;
    }
    const body = await readBody(req);
    if (url.pathname === "/discord/interactions") {
      await handleInteraction(req, res, body);
      return;
    }
    try {
      const event = JSON.parse(body.toString("utf8"));
      const embed = embedForEvent(event);
      if (embed) await postToDiscord(embed);
    } catch (error) {
      console.error("Payload LiveKit inválido:", error.message);
    }
    res.writeHead(200); res.end("ok");
  }).catch((error) => {
    console.error("Erro no relay:", error.message);
    if (!res.headersSent) sendJson(res, 500, { error: "internal" });
    else res.end();
  });
});

server.requestTimeout = 10000;
server.headersTimeout = 8000;
server.keepAliveTimeout = 8000;
server.listen(PORT, "0.0.0.0", () => {
  console.log("Discord relay e monitor de banda ouvindo na porta " + PORT);
  void registerBandwidthCommand();
  void monitorBandwidth();
  setInterval(() => { void monitorBandwidth(); }, MONITOR_INTERVAL_MS).unref();
});
