// Release local: usa o mesmo backend, restrito ao loopback e sem instalar npm.
process.env.HOST = "127.0.0.1";
process.env.PORT = process.env.PORT || "3000";
process.env.LIVEKIT_API_KEY = "devkey";
process.env.LIVEKIT_API_SECRET = "devsecret";
process.env.PUBLIC_WSS_URL = "ws://localhost:7880";
process.env.LIVEKIT_API_URL = "http://127.0.0.1:7880";
console.log("Modo local: chaves de desenvolvimento. Nao exponha este processo na internet.");
console.log("Abra http://localhost:" + process.env.PORT + " (LiveKit local deve estar iniciado).");
require("./frontend/server.cjs");
