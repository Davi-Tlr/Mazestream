import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export function safePath(base, relative) {
  assert.ok(relative && !path.isAbsolute(relative), "Caminho relativo obrigatorio.");
  const result = path.resolve(base, relative);
  const rest = path.relative(path.resolve(base), result);
  assert.ok(rest && !rest.startsWith(`..${path.sep}`) && rest !== ".." && !path.isAbsolute(rest), "Caminho fora do pacote.");
  return result;
}

export function copyAllowed(sourceRoot, destinationRoot, source, destination = source) {
  const from = safePath(sourceRoot, source);
  const to = safePath(destinationRoot, destination);
  const stat = lstatSync(from);
  assert.ok(!stat.isSymbolicLink(), `Link simbolico nao permitido no pacote: ${source}`);
  if (stat.isDirectory()) {
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(from).sort()) copyAllowed(sourceRoot, destinationRoot, path.join(source, name), path.join(destination, name));
  } else {
    assert.ok(stat.isFile(), `Tipo de arquivo nao permitido: ${source}`);
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
    if (/\.(?:sh|yaml)$/.test(to) || /Dockerfile/.test(path.basename(to))) {
      writeFileSync(to, readFileSync(to, "utf8").replace(/\r\n/g, "\n"));
    }
  }
}

export function listFiles(base, relative = "") {
  return readdirSync(path.join(base, relative), { withFileTypes: true }).flatMap((entry) => {
    assert.ok(!entry.isSymbolicLink(), "Pacote nao pode conter links simbolicos.");
    const file = path.posix.join(relative, entry.name);
    return entry.isDirectory() ? listFiles(base, file) : [file];
  }).sort();
}

export function validatePackage(directory, profile, expectedVersion) {
  const files = listFiles(directory);
  for (const file of files) {
    const parts = file.split("/");
    assert.ok(!parts.some((part) => part.startsWith(".") || ["node_modules", "src"].includes(part)), `Arquivo privado/de desenvolvimento: ${file}`);
    assert.ok(!/(?:^|\/)(?:livekit\.yaml|preview\.html)$|\.(?:map|pem|key|log)$|\.test\./i.test(file), `Arquivo nao permitido: ${file}`);
  }
  for (const file of ["frontend/server.cjs", "frontend/server-votekick.cjs", "frontend/dist/index.html", "frontend/dist/build-info.json", "README.md"]) {
    assert.ok(files.includes(file), `Arquivo obrigatorio ausente: ${file}`);
  }
  const info = JSON.parse(readFileSync(path.join(directory, "frontend/dist/build-info.json"), "utf8"));
  assert.equal(info.profile, profile === "selfhost" ? "host-a1" : "local", "Build pertence ao perfil errado.");
  if (expectedVersion !== undefined) assert.equal(info.version, expectedVersion, "Build pertence a outra versao; recompile antes de empacotar.");
  if (profile === "local") {
    assert.ok(files.includes("start.cjs"));
    assert.ok(!files.some((file) => file.startsWith("discord-relay/") || file === "deploy.sh"), "Release local nao leva infraestrutura de producao.");
  } else {
    assert.ok(files.includes("frontend/Dockerfile"));
    assert.ok(files.includes("docker-compose.host-a1.yaml"));
    const dockerfile = readFileSync(path.join(directory, "frontend/Dockerfile"), "utf8");
    assert.ok(!/\bRUN\s+.*\bnpm\b/i.test(dockerfile), "O pacote self-hosted nao deve compilar no servidor.");
    assert.ok(!files.includes("start.cjs"), "Chaves locais nao pertencem ao pacote self-hosted.");
  }
  return info;
}

export function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export function writeChecksums(directory) {
  const lines = listFiles(directory).filter((file) => file !== "SHA256SUMS").map((file) => `${sha256(path.join(directory, file))}  ${file}`);
  writeFileSync(path.join(directory, "SHA256SUMS"), lines.join("\n") + "\n");
}

export function thirdPartyNotices(sourceRoot) {
  const lock = JSON.parse(readFileSync(path.join(sourceRoot, "package-lock.json"), "utf8"));
  const notices = ["Mazestream — dependencias de terceiros", "Licencas dos pacotes de runtime instalados. Nao substitui a licenca do projeto.\n"];
  for (const [directory, item] of Object.entries(lock.packages)) {
    if (!directory.includes("node_modules/") || item.link || item.dev) continue;
    const installed = path.join(sourceRoot, directory);
    if (!existsSync(installed)) continue; // Dependencias opcionais de outra plataforma.
    const metadata = JSON.parse(readFileSync(path.join(installed, "package.json"), "utf8"));
    notices.push(`\n--- ${metadata.name}@${metadata.version} (${metadata.license || "ver pacote original"}) ---`);
    for (const file of readdirSync(installed)) {
      if (/^(?:licen[sc]e|copying|notice)(?:[.-].*)?$/i.test(file) && lstatSync(path.join(installed, file)).isFile()) {
        notices.push(readFileSync(path.join(installed, file), "utf8"));
      }
    }
  }
  return notices.join("\n") + "\n";
}
