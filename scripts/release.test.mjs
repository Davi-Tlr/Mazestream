import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { parseDocument } from "yaml";
import { root } from "./build-info.mjs";
import { copyAllowed, safePath, validatePackage, writeChecksums } from "./release-lib.mjs";
import { resolveAppProfile } from "../frontend/src/config/appProfile.js";

function fixture(t, profile = "local") {
  const base = mkdtempSync(path.join(tmpdir(), "mazestream-release-test-"));
  t.after(() => {
    const absolute = path.resolve(base);
    assert.equal(path.dirname(absolute), path.resolve(tmpdir()));
    assert.ok(path.basename(absolute).startsWith("mazestream-release-test-"));
    rmSync(absolute, { recursive: true, force: true });
  });
  const put = (file, content = "fixture") => {
    const target = safePath(base, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  for (const file of ["frontend/server.cjs", "frontend/server-votekick.cjs", "frontend/dist/index.html", "README.md"]) put(file);
  put("frontend/dist/build-info.json", JSON.stringify({ profile }));
  put("start.cjs");
  return { base, put };
}

test("os perfis compartilham resolucao e diferem apenas nas politicas declaradas", () => {
  assert.equal(resolveAppProfile("local").screenBitrates.high, 5_000_000);
  assert.equal(resolveAppProfile("host-a1").screenBitrates.high, 4_000_000);
  assert.equal(resolveAppProfile("inexistente", true).id, "host-a1");
});

test("selfhost defaults inherit the public API endpoint without overriding an explicit internal URL", () => {
  const compose = parseDocument(readFileSync(path.join(root, "docker-compose.yaml"), "utf8")).toJS();
  for (const service of ["frontend", "discord-relay"]) {
    const environment = compose.services[service].environment;
    assert.equal(environment.find((line) => line.startsWith("LIVEKIT_API_URL=")), "LIVEKIT_API_URL=${LIVEKIT_API_URL:-}");
    assert.ok(environment.includes("PUBLIC_WSS_URL=${PUBLIC_WSS_URL:-}"));
    assert.ok(compose.services[service].extra_hosts.includes("host.docker.internal:host-gateway"));
  }
  const deploy = readFileSync(path.join(root, "deploy.sh"), "utf8");
  const generatedEnv = deploy.match(/^cat > \.env <<EOF\r?\n([\s\S]*?)^EOF\r?$/m)?.[1];
  assert.ok(generatedEnv, "Installer env template is missing.");
  assert.match(generatedEnv, /^PUBLIC_WSS_URL=wss:\/\/\$DOMAIN\r?$/m);
  assert.match(generatedEnv, /^LIVEKIT_API_URL=\r?$/m);
  assert.match(readFileSync(path.join(root, "host-a1.env.example"), "utf8"), /^LIVEKIT_API_URL=\r?$/m);
});
test("caminhos de empacotamento nao escapam da raiz", () => {
  for (const file of ["../outside", "", path.resolve(root, "package.json")]) assert.throws(() => safePath(root, file));
});
test("pacote local valido e checksums", (t) => {
  const { base } = fixture(t);
  assert.equal(validatePackage(base, "local").profile, "local");
  writeChecksums(base);
  assert.match(readFileSync(path.join(base, "SHA256SUMS"), "utf8"), /[a-f0-9]{64}  frontend\/dist\/index.html/);
});
for (const file of [".env", "frontend/dist/.env", "frontend/dist/assets/app.js.map", "livekit.yaml", "node_modules/x/index.js", "frontend/dist/preview.html"]) {
  test(`pacote rejeita arquivo inesperado: ${file}`, (t) => {
    const { base, put } = fixture(t);
    put(file);
    assert.throws(() => validatePackage(base, "local"));
  });
}
test("pacote rejeita build de outro perfil", (t) => {
  const { base } = fixture(t, "host-a1");
  assert.throws(() => validatePackage(base, "local"));
});

test("pacote rejeita metadados de uma versao anterior", (t) => {
  const { base, put } = fixture(t);
  put("frontend/dist/build-info.json", JSON.stringify({ profile: "local", version: "1.2.0" }));
  assert.throws(() => validatePackage(base, "local", "1.2.1"), /outra versao/);
  assert.equal(validatePackage(base, "local", "1.2.0").version, "1.2.0");
});

test("pacote rejeita metadados sem versao", (t) => {
  const { base } = fixture(t);
  assert.throws(() => validatePackage(base, "local", "1.2.1"), /outra versao/);
});
test("copia normaliza scripts para Linux sem alterar o original", (t) => {
  const { base, put } = fixture(t);
  put("source/run.sh", "#!/bin/sh\r\necho ok\r\n");
  mkdirSync(path.join(base, "destination"));
  copyAllowed(path.join(base, "source"), path.join(base, "destination"), "run.sh");
  assert.equal(readFileSync(path.join(base, "destination/run.sh"), "utf8"), "#!/bin/sh\necho ok\n");
  assert.match(readFileSync(path.join(base, "source/run.sh"), "utf8"), /\r\n/);
});
