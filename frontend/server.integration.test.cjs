const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");
const zlib = require("node:zlib");
const { once } = require("node:events");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => {
    if (!server.listening) { resolve(); return; }
    server.close(() => resolve());
  });
}

function request(port, pathname, options = {}, body = "") {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1", port, path: pathname,
      method: options.method || "GET",
      headers: Object.assign({}, options.headers || {}, body ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      } : {})
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    req.setTimeout(5000, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function waitForOutput(child, output, timeoutMs = 5000) {
  if (output.text.includes("Mazestream na porta")) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("servidor não iniciou: " + output.text));
    }, timeoutMs);
    const onData = () => {
      if (!output.text.includes("Mazestream na porta")) return;
      cleanup();
      resolve();
    };
    const onExit = (code, signal) => {
      cleanup();
      reject(new Error("servidor encerrou antes de iniciar (" + code + ", " + signal + ")"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", onExit);
  });
}

test("token admission, uploads and HTTP assets work without a previous build", async (t) => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), "mazestream-http-test-"));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(site)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(site).startsWith("mazestream-http-test-"));
    fs.rmSync(site, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(site, "assets"));
  const html = '<!doctype html><html><script src="/assets/app-fixture123.js"></script></html>';
  fs.writeFileSync(path.join(site, "index.html"), html);
  fs.writeFileSync(path.join(site, "index.html.br"), zlib.brotliCompressSync(html));
  fs.writeFileSync(path.join(site, "assets", "app-fixture123.js"), 'console.log("fixture");');
  fs.writeFileSync(path.join(site, "build-info.json"), JSON.stringify({ profile: "local" }));
  const rooms = [];
  let createCalls = 0;
  const livekit = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      let payload = {};
      try { payload = body ? JSON.parse(body) : {}; } catch (e) {}
      const method = req.url.split("/").pop();
      res.setHeader("Content-Type", "application/json");
      if (method === "ListRooms") {
        res.end(JSON.stringify({ rooms }));
        return;
      }
      if (method === "CreateRoom") {
        createCalls += 1;
        const room = {
          name: payload.name,
          max_participants: payload.max_participants,
          num_participants: 0
        };
        rooms.push(room);
        res.end(JSON.stringify(room));
        return;
      }
      if (method === "ListParticipants") {
        res.end(JSON.stringify({ participants: [] }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "unknown method" }));
    });
  });
  const livekitPort = await listen(livekit);
  const appPort = await new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
  const output = { text: "" };
  const child = spawn(process.execPath, [path.join(__dirname, "server.cjs")], {
    cwd: __dirname,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(appPort),
      MAZESTREAM_DIST_DIR: site,
      LIVEKIT_API_KEY: "test-key",
      LIVEKIT_API_SECRET: "test-secret",
      LIVEKIT_API_URL: "http://127.0.0.1:" + livekitPort,
      PUBLIC_WSS_URL: "ws://127.0.0.1:7880",
      MAX_ROOMS: "5",
      MAX_PARTICIPANTS_PER_ROOM: "12",
      TOKENS_POR_SEG: "40",
      SHARE_MAX_MB: "1",
      SHARE_TOTAL_MB: "1",
      SHARE_MAX_FILES: "3",
      SHARE_MAX_UPLOADS: "1",
      SHARE_UPLOADS_PER_MINUTE: "3"
    },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true
  });
  child.stdout.on("data", (chunk) => { output.text += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output.text += chunk.toString(); });

  try {
    await waitForOutput(child, output);
    const tokenResponse = await request(appPort, "/token?room=teste%20room&name=Ana", { headers: { "X-Maze-Pin": "" } });
    assert.equal(tokenResponse.status, 200);
    const token = JSON.parse(tokenResponse.body);
    assert.equal(token.room, "testeroom");
    assert.equal(token.isHost, true);
    assert.equal(createCalls, 1);
    assert.equal(rooms[0].max_participants, 12);

    const [firstRace, secondRace] = await Promise.all([
      request(appPort, "/token?room=race&name=Primeiro", { headers: { "X-Maze-Pin": "4321" } }),
      request(appPort, "/token?room=race&name=Segundo")
    ]);
    assert.deepEqual([firstRace.status, secondRace.status].sort((a, b) => a - b), [200, 403]);

    const controlResponse = await request(appPort, "/api/room-control", {
      method: "POST",
      headers: { "X-Maze-Session": token.session }
    }, JSON.stringify({ action: "preset", preset: "jogo" }));
    assert.equal(controlResponse.status, 200);
    assert.equal(JSON.parse(controlResponse.body).roomState.preset, "jogo");

    const missingAsset = await request(appPort, "/assets/missing.js", {
      headers: { Accept: "application/javascript" }
    });
    assert.equal(missingAsset.status, 404);
    const spaRoute = await request(appPort, "/sala/teste", {
      headers: { Accept: "text/html" }
    });
    assert.equal(spaRoute.status, 200);
    const headRoute = await request(appPort, "/index.html", { method: "HEAD" });
    assert.equal(headRoute.status, 200);
    assert.equal(headRoute.body, "");
    assert.equal(headRoute.headers["cache-control"], "no-cache");
    assert.equal(headRoute.headers["x-content-type-options"], "nosniff");

    const buildInfoResponse = await request(appPort, "/build-info.json");
    assert.equal(buildInfoResponse.status, 200);
    assert.equal(buildInfoResponse.headers["cache-control"], "no-cache");
    assert.ok(["local", "host-a1"].includes(JSON.parse(buildInfoResponse.body).profile));

    {
      const compressedRoute = await request(appPort, "/index.html", {
        headers: { "Accept-Encoding": "br, gzip" }
      });
      assert.equal(compressedRoute.status, 200);
      assert.equal(compressedRoute.headers["content-encoding"], "br");
      assert.equal(compressedRoute.headers.vary, "Accept-Encoding");
    }

    {
        const assetRoute = await request(appPort, "/assets/app-fixture123.js");
        assert.equal(assetRoute.status, 200);
        assert.equal(assetRoute.headers["cache-control"], "public, max-age=31536000, immutable");
    }

    await t.test("uploads require a session and reject oversized bodies before reading", async () => {
      assert.equal((await request(appPort, "/api/share", { method: "POST" }, "x")).status, 401);
      const response = await request(appPort, "/api/share", { method: "POST", headers: {
        "X-Maze-Session": token.session, "Content-Length": String(1024 * 1024 + 1)
      } });
      assert.equal(response.status, 413);
    });

    const guest = JSON.parse((await request(appPort, "/token?room=testeroom&name=Bia")).body);
    const guestOptions = { method: "POST", headers: { "X-Maze-Session": guest.session } };
    await t.test("an interrupted upload releases global and session reservations", async () => {
      const pending = http.request({ hostname: "127.0.0.1", port: appPort, path: "/api/share", method: "POST",
        headers: { "X-Maze-Session": token.session, "Content-Length": "1024", Expect: "100-continue" }
      });
      pending.on("error", () => {});
      pending.setTimeout(3000, () => pending.destroy());
      try {
        const ready = once(pending, "continue");
        pending.flushHeaders();
        await ready;
        assert.equal((await request(appPort, "/api/share", guestOptions, "x")).status, 429);
      } finally {
        const closed = new Promise((resolve) => pending.once("close", resolve));
        pending.destroy();
        await closed;
      }
      // Wait for the server to observe the socket close, not for a fixed sleep.
      let uploaded;
      for (let attempt = 0; attempt < 20; attempt++) {
        uploaded = await request(appPort, "/api/share?name=sample.txt&type=text/plain", guestOptions, "x");
        if (uploaded.status !== 429) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(uploaded.status, 200);
      const download = await request(appPort, JSON.parse(uploaded.body).url);
      assert.equal(download.body, "x");
      assert.equal(download.headers["x-content-type-options"], "nosniff");
    });
    await t.test("capacity is reserved for chunked bodies before buffering", async () => {
      const response = await request(appPort, "/api/share", { method: "POST", headers: {
        "X-Maze-Session": token.session, "Transfer-Encoding": "chunked"
      } });
      // One stored byte + the unknown body's 1 MiB reservation exceeds the cap.
      assert.equal(response.status, 507);
    });
    await t.test("upload frequency and tiny-file count have independent limits", async () => {
      assert.equal((await request(appPort, "/api/share", guestOptions, "y")).status, 200);
      assert.equal((await request(appPort, "/api/share", guestOptions, "z")).status, 200);
      const rate = await request(appPort, "/api/share", guestOptions, "w");
      assert.equal(rate.status, 429);
      assert.ok(Number(rate.headers["retry-after"]) > 0);
      const count = await request(appPort, "/api/share", {
        method: "POST", headers: { "X-Maze-Session": token.session }
      }, "w");
      assert.equal(count.status, 507);
    });
  } finally {
    const stopped = once(child, "close");
    child.kill();
    await stopped;
    await close(livekit);
  }
});
