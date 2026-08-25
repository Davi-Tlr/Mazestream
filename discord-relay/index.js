// Relay de eventos do LiveKit para um webhook do Discord.
// Recebe os webhooks do LiveKit (localhost:8080), traduz e posta no Discord.
// Node puro, sem dependencias.
//
// Variaveis de ambiente:
//   DISCORD_WEBHOOK_URL   obrigatorio, o webhook do seu canal no Discord.
//   PUBLIC_URL            opcional, link que aparece na mensagem (ex: https://seunome.duckdns.org).
//   PORT                  opcional, padrao 8080.

const http = require("http");
const https = require("https");
const { URL } = require("url");

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";
const PUBLIC_URL = process.env.PUBLIC_URL || "";
const PORT = parseInt(process.env.PORT || "8080", 10);

if (!DISCORD_WEBHOOK_URL) {
  console.error("DISCORD_WEBHOOK_URL nao definido. Abortando.");
  process.exit(1);
}

function postToDiscord(embed) {
  const u = new URL(DISCORD_WEBHOOK_URL);
  const body = JSON.stringify({ embeds: [embed] });
  const req = https.request(
    {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    },
    (res) => { res.resume(); }
  );
  req.on("error", (e) => console.error("Erro postando no Discord:", e.message));
  req.write(body);
  req.end();
}

// cores em decimal
const COR = { verde: 5763719, azul: 3447003, laranja: 15105570, vermelho: 15548997, cinza: 9807270 };

function embedFor(event) {
  const room = event.room && event.room.name ? event.room.name : "sala";
  const who = event.participant && event.participant.name
    ? event.participant.name
    : (event.participant && event.participant.identity ? event.participant.identity : "alguem");
  const now = new Date().toISOString();
  const base = { footer: { text: "LiveKit" }, timestamp: now };
  if (PUBLIC_URL) base.url = PUBLIC_URL;

  switch (event.event) {
    case "room_started":
      return Object.assign({ title: "🟢 Sala aberta", color: COR.verde,
        description: `A sala **${room}** esta aberta.`,
        fields: PUBLIC_URL ? [{ name: "Entrar", value: PUBLIC_URL }] : [] }, base);
    case "participant_joined":
      return Object.assign({ title: "👋 Entrou na sala", color: COR.azul,
        description: `**${who}** entrou em **${room}**.` }, base);
    case "track_published":
      return Object.assign({ title: "🔴 Transmissao ao vivo", color: COR.vermelho,
        description: `**${who}** comecou a compartilhar em **${room}**.`,
        fields: PUBLIC_URL ? [{ name: "Assistir", value: PUBLIC_URL }] : [] }, base);
    case "participant_left":
      return Object.assign({ title: "Saiu da sala", color: COR.cinza,
        description: `**${who}** saiu de **${room}**.` }, base);
    case "room_finished":
      return Object.assign({ title: "Sala encerrada", color: COR.cinza,
        description: `A sala **${room}** foi encerrada.` }, base);
    default:
      return null;
  }
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST") { res.writeHead(200); res.end("ok"); return; }
  let data = "";
  req.on("data", (c) => { data += c; if (data.length > 1e6) req.destroy(); });
  req.on("end", () => {
    try {
      const event = JSON.parse(data);
      const embed = embedFor(event);
      if (embed) postToDiscord(embed);
    } catch (e) {
      console.error("Payload invalido:", e.message);
    }
    res.writeHead(200);
    res.end("ok");
  });
});

server.listen(PORT, "0.0.0.0", () => console.log(`Discord relay ouvindo na porta ${PORT}`));
