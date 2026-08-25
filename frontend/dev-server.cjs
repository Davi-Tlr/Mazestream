// Desenvolvimento local usa o mesmo backend funcional da producao para que
// PIN, host, espectador, permissoes, chat e arquivos temporarios sejam testaveis.
process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "devkey";
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "devsecret";
process.env.PUBLIC_WSS_URL = process.env.PUBLIC_WSS_URL || "ws://localhost:7880";
process.env.LIVEKIT_API_URL = process.env.LIVEKIT_API_URL || "http://localhost:7880";
process.env.PORT = process.env.PORT || "3001";
process.env.MAX_ROOMS = process.env.MAX_ROOMS || "100";
process.env.TOKENS_POR_SEG = process.env.TOKENS_POR_SEG || "100";

console.log("[dev-server] Backend completo do Mazestream em http://127.0.0.1:" + process.env.PORT);
require("./server.cjs");
