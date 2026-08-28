import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import { root } from "./build-info.mjs";
import { copyAllowed, sha256, thirdPartyNotices, validatePackage, writeChecksums } from "./release-lib.mjs";
import { smokePackage } from "./smoke-package.mjs";
import { checkVersions, releaseTag } from "./versions.mjs";

const selection = process.argv[2] || "all";
assert.ok(["all", "local", "selfhost"].includes(selection), "Use local, selfhost ou all.");
assert.ok(process.env.npm_execpath, "Execute por npm run release:packages.");
const npm = (...args) => execFileSync(process.execPath, [process.env.npm_execpath, ...args], { cwd: root, stdio: "inherit" });
const pkg = checkVersions(root, { tag: releaseTag() });
const profiles = selection === "all" ? ["local", "selfhost"] : [selection];
const artifacts = path.join(root, "artifacts");
mkdirSync(artifacts, { recursive: true });
// Nunca sobrescrever nem apagar um release anterior.
const output = mkdtempSync(path.join(artifacts, "build-"));
const archives = [];
const packages = {};
npm("run", "check");

for (const profile of profiles) {
  npm("run", profile === "local" ? "build:local" : "build:host");
  npm("test");
  const name = `mazestream-${profile}-${pkg.version}`;
  const stage = path.join(output, name);
  mkdirSync(stage);
  for (const file of ["frontend/server.cjs", "frontend/server-votekick.cjs", "frontend/dist"]) copyAllowed(root, stage, file);
  if (profile === "local") {
    for (const file of ["docker-compose.local.yaml", "deploy/livekit.local.yaml"]) copyAllowed(root, stage, file);
    copyAllowed(root, stage, "packaging/start-local.cjs", "start.cjs");
    copyAllowed(root, stage, "packaging/README.local.md", "README.md");
    writeFileSync(path.join(stage, "package.json"), JSON.stringify({
      name: "mazestream-local", version: pkg.version, private: true, engines: pkg.engines,
      scripts: { start: "node start.cjs", "livekit:up": "docker compose -p mazestream-local -f docker-compose.local.yaml up -d", "livekit:down": "docker compose -p mazestream-local -f docker-compose.local.yaml down" }
    }, null, 2) + "\n");
  } else {
    for (const file of ["docker-compose.yaml", "docker-compose.host-a1.yaml", "livekit.yaml.example", "host-a1.env.example", "deploy.sh", "nginx", "docs"]) copyAllowed(root, stage, file);
    for (const file of ["discord-relay/Dockerfile", "discord-relay/index.js", "discord-relay/bandwidth.cjs"]) copyAllowed(root, stage, file);
    copyAllowed(root, stage, "frontend/Dockerfile.runtime", "frontend/Dockerfile");
    copyAllowed(root, stage, "packaging/README.selfhost.md", "README.md");
  }
  const info = validatePackage(stage, profile, pkg.version);
  writeFileSync(path.join(stage, "release.json"), JSON.stringify({ ...info, distribution: profile, node: process.version }, null, 2) + "\n");
  writeFileSync(path.join(stage, "THIRD_PARTY_NOTICES.txt"), thirdPartyNotices(root));
  writeChecksums(stage);
  await smokePackage(stage, profile);
  const archive = path.join(output, `${name}.tar.gz`);
  // GNU tar (Git Bash) interprets C: in an archive argument as a remote host.
  // A relative filename and process cwd also work with Windows/macOS bsdtar.
  execFileSync("tar", ["-czf", path.basename(archive), name], { cwd: output, stdio: "inherit" });
  archives.push(`${sha256(archive)}  ${path.basename(archive)}`);
  packages[profile] = path.relative(root, stage).replaceAll(path.sep, "/");
  console.log(`Pacote ${profile}: ${archive}`);
}
writeFileSync(path.join(output, "SHA256SUMS"), archives.join("\n") + "\n");
writeFileSync(path.join(artifacts, "latest.json"), JSON.stringify({ output: path.relative(root, output).replaceAll(path.sep, "/"), packages }, null, 2) + "\n");
console.log("Pacotes locais gerados e testados. Nenhum upload ou deploy foi executado.");
