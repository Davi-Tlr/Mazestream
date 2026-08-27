import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { root } from "./build-info.mjs";
import { safePath } from "./release-lib.mjs";

// Somente validacao/build em um ambiente com Docker. Nao sobe servicos nem faz deploy.
const latest = JSON.parse(readFileSync(path.join(root, "artifacts/latest.json"), "utf8"));
assert.ok(latest.packages.selfhost, "Gere o pacote selfhost primeiro.");
const stage = safePath(root, latest.packages.selfhost);
const docker = (cwd, ...args) => {
  try {
    execFileSync("docker", args, { cwd, stdio: "inherit" });
  } catch (error) {
    if (error.code === "ENOENT") {
      console.error("Docker nao encontrado. Instale Docker/Compose para esta verificacao ou execute o workflow Linux. Nenhum container foi validado.");
      process.exit(1);
    }
    throw error;
  }
};
docker(root, "compose", "-f", "docker-compose.local.yaml", "config", "--quiet");
docker(stage, "compose", "-f", "docker-compose.yaml", "-f", "docker-compose.host-a1.yaml", "--profile", "web", "--profile", "discord", "config", "--quiet");
docker(stage, "build", "-f", "frontend/Dockerfile", "-t", "mazestream-web:ci", ".");
docker(stage, "build", "-f", "discord-relay/Dockerfile", "-t", "mazestream-discord:ci", "discord-relay");
docker(root, "build", "-f", "frontend/Dockerfile", "-t", "mazestream-web-source:ci", ".");
