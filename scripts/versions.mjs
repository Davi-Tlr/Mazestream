import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { root } from "./build-info.mjs";
import { safePath } from "./release-lib.mjs";

// Stable versions and release candidates; npm performs the actual SemVer increment.
export function isReleaseVersion(value) {
  if (typeof value !== "string" || value.length > 256) return false;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  return Boolean(match && match.slice(1, 4).every((part) => Number.isSafeInteger(Number(part)))
    && (!match[4] || match[4].split(".").every((part) => !/^0\d+$/.test(part))));
}

export function releaseTag(env = process.env) {
  return env.GITHUB_REF_TYPE === "tag" ? (env.GITHUB_REF_NAME || "") : undefined;
}

export function checkVersions(directory, { tag } = {}) {
  const readJson = (file) => JSON.parse(readFileSync(safePath(directory, file), "utf8"));
  const pkg = readJson("package.json");
  const lock = readJson("package-lock.json");
  assert.ok(isReleaseVersion(pkg.version), "Versao invalida: use X.Y.Z ou X.Y.Z-rc.1 no package.json.");
  assert.ok(Array.isArray(pkg.workspaces), "Declare os diretorios dos workspaces no package.json.");
  assert.equal(lock.version, pkg.version, "Versao divergente no package-lock.json.");
  assert.equal(lock.packages?.[""]?.version, pkg.version, "Versao divergente em package-lock.json: packages[\"\"].");
  for (const workspace of pkg.workspaces) {
    const child = readJson(`${workspace}/package.json`);
    assert.equal(child.version, pkg.version, `Versao divergente em ${workspace}/package.json.`);
    assert.equal(lock.packages?.[workspace]?.version, pkg.version, `Versao divergente em package-lock.json: ${workspace}.`);
  }
  if (tag !== undefined) assert.equal(tag, `v${pkg.version}`, "Tag e versao dos pacotes divergem.");
  return pkg;
}

export function bumpVersion(directory, change, { npmCli = process.env.npm_execpath, stdio = "inherit" } = {}) {
  assert.ok(["patch", "minor", "major"].includes(change) || isReleaseVersion(change),
    "Use patch, minor, major ou uma versao exata, como 1.2.1 ou 1.2.0-rc.1.");
  assert.ok(npmCli, "Execute por npm run version:patch, version:minor, version:major ou version:set -- X.Y.Z.");
  const before = checkVersions(directory);
  const files = ["package.json", ...before.workspaces.map((workspace) => `${workspace}/package.json`), "package-lock.json"];
  const originals = files.map((file) => [safePath(directory, file), readFileSync(safePath(directory, file))]);
  try {
    // No lifecycle hooks, Git writes, downloads or dependency installation during a bump.
    execFileSync(process.execPath, [npmCli, "version", change,
      "--workspaces", "--include-workspace-root", "--workspaces-update=true",
      "--no-git-tag-version", "--allow-same-version=false", "--ignore-scripts",
      "--package-lock-only", "--offline", "--no-audit", "--no-fund"
    ], { cwd: directory, stdio, timeout: 30_000 });
    const after = checkVersions(directory);
    assert.notEqual(after.version, before.version, "A versao nao foi alterada.");
    if (isReleaseVersion(change)) assert.equal(after.version, change, "O npm nao aplicou a versao solicitada.");
    return { previous: before.version, version: after.version, files };
  } catch (error) {
    // npm updates the workspaces sequentially; do not leave a partially bumped release.
    for (const [file, contents] of originals) writeFileSync(file, contents);
    throw error;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [command, change, ...extra] = process.argv.slice(2);
    if (command === "check" && change === undefined) {
      const pkg = checkVersions(root, { tag: releaseTag() });
      console.log(`Versao ${pkg.version}: manifests, lockfile e tag (quando aplicavel) sincronizados.`);
    } else {
      assert.ok(command === "bump" && change && extra.length === 0,
        "Use npm run check:versions ou npm run version:set -- X.Y.Z (tambem: version:patch/minor/major).");
      const result = bumpVersion(root, change);
      console.log(`Versao ${result.previous} -> ${result.version}. Revise: ${result.files.join(", ")}.`);
      console.log("Nenhum commit, tag, push, release ou deploy foi feito. Execute npm run verify antes de publicar.");
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
