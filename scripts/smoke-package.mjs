import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

export async function smokePackage(directory, profile) {
  const probe = http.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  const entry = profile === "local" ? "start.cjs" : "frontend/server.cjs";
  const child = spawn(process.execPath, [path.join(directory, entry)], {
    cwd: directory,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), LIVEKIT_API_KEY: "smoke-key", LIVEKIT_API_SECRET: "smoke-secret", LIVEKIT_API_URL: "http://127.0.0.1:9", PUBLIC_WSS_URL: "ws://127.0.0.1:9" },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true
  });
  let output = "";
  let spawnError;
  child.on("error", (error) => { spawnError = error; });
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const url = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 8000;
    while (!output.includes("Mazestream na porta")) {
      if (spawnError) throw spawnError;
      assert.ok(child.exitCode === null && Date.now() < deadline, `Pacote nao iniciou: ${output}`);
      await delay(30);
    }
    const options = { signal: AbortSignal.timeout(5000), headers: { "Accept-Encoding": "identity" } };
    const response = await fetch(url + "/build-info.json", options);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-cache", "Identificacao do deploy nao deve ficar presa em cache.");
    const info = await response.json();
    assert.equal(info.profile, profile === "selfhost" ? "host-a1" : "local");
    const index = await fetch(url + "/", { ...options, headers: { ...options.headers, Accept: "text/html" } });
    assert.equal(index.status, 200);
    const html = await index.text();
    const asset = html.match(/src="(\/assets\/[^"?]+\.js)"/);
    assert.ok(asset, "HTML sem bundle principal.");
    const javascript = await fetch(url + asset[1], options);
    assert.equal(javascript.status, 200);
    assert.match(javascript.headers.get("content-type"), /javascript/);
    await javascript.arrayBuffer();
    const missing = await fetch(url + "/assets/does-not-exist.js", options);
    assert.equal(missing.status, 404);
    await missing.text();
    console.log(`Smoke HTTP do pacote ${profile}: inicio, metadados, HTML, bundle e 404 OK.`);
  } finally {
    if (child.exitCode === null && !spawnError) {
      const closed = once(child, "close");
      child.kill();
      await closed;
    }
  }
}
