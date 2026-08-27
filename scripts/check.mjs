import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { root } from "./build-info.mjs";
import { parseDocument } from "yaml";

const readJson = (file) => JSON.parse(readFileSync(path.join(root, file), "utf8"));
const pkg = readJson("package.json");
const lock = readJson("package-lock.json");
assert.equal(pkg.private, true, "O workspace nao deve ser publicado no npm.");
assert.equal(lock.name, pkg.name);
assert.equal(lock.version, pkg.version);
assert.deepEqual(lock.packages[""].devDependencies, pkg.devDependencies);
assert.deepEqual(lock.packages[""].workspaces, pkg.workspaces);
for (const workspace of pkg.workspaces) {
  const child = readJson(`${workspace}/package.json`);
  assert.equal(child.private, true);
  assert.equal(child.version, pkg.version, "Os pacotes fazem parte da mesma versao de release.");
  assert.equal(existsSync(path.join(root, workspace, "package-lock.json")), false, "Use somente o lockfile da raiz.");
  for (const kind of ["dependencies", "devDependencies"]) {
    assert.deepEqual(lock.packages[workspace][kind] || {}, child[kind] || {}, `Lockfile divergente: ${workspace}/${kind}`);
  }
}

let checked = 0;
function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git", "artifacts"].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) inspect(file);
    else if (/\.(?:cjs|mjs|js)$/.test(entry.name)) {
      execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
      checked++;
    }
  }
}
for (const directory of ["frontend", "discord-relay", "scripts", "packaging"]) inspect(path.join(root, directory));
for (const directory of [root, path.join(root, "docs")]) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const text = readFileSync(path.join(directory, entry.name), "utf8");
    for (const match of text.matchAll(/\]\(([^\s)#]+)(?:#[^)]*)?\)/g)) {
      const target = match[1];
      if (/^[a-z]+:|^#/.test(target)) continue;
      assert.ok(existsSync(path.resolve(directory, target)), `Link local quebrado: ${entry.name} -> ${target}`);
    }
  }
}
for (const file of [".github/workflows/ci.yml", ".github/workflows/release.yml", "docker-compose.yaml", "docker-compose.host-a1.yaml", "docker-compose.local.yaml", "deploy/livekit.local.yaml"]) {
  const document = parseDocument(readFileSync(path.join(root, file), "utf8"), { uniqueKeys: true });
  assert.deepEqual(document.errors, [], `YAML invalido: ${file}`);
  if (file.startsWith(".github/")) {
    const workflow = document.toJS();
    assert.equal(workflow.permissions.contents, "read");
    assert.ok(!Object.hasOwn(workflow.on, "pull_request_target"));
    for (const job of Object.values(workflow.jobs)) {
      assert.ok(job["timeout-minutes"] > 0, "Job sem timeout.");
      for (const step of job.steps) {
        if (step.uses) assert.match(step.uses, /^actions\/[a-z-]+@[a-f0-9]{40}$/, "Action sem pin SHA completo.");
      }
    }
  }
}
console.log(`Workspace, lockfile, YAML, pins das Actions, links e sintaxe de ${checked} arquivos: OK. JSX e CSS sao verificados pelo build.`);
