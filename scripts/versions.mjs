import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { root } from "./build-info.mjs";
import { safePath } from "./release-lib.mjs";

// Stable versions and release candidates.
export function isReleaseVersion(value) {
  if (typeof value !== "string" || value.length > 256) return false;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  return Boolean(match && match.slice(1, 4).every((part) => Number.isSafeInteger(Number(part)))
    && (!match[4] || match[4].split(".").every((part) => !/^0\d+$/.test(part))));
}

export function releaseTag(env = process.env) {
  return env.GITHUB_REF_TYPE === "tag" ? (env.GITHUB_REF_NAME || "") : undefined;
}

// A versao do produto vive somente em versions.js; os manifests e o lockfile
// nao declaram version propria.
function readVersion(directory) {
  const text = readFileSync(safePath(directory, "versions.js"), "utf8");
  const match = /VERSION\s*=\s*"([^"]+)"/.exec(text);
  assert.ok(match, 'versions.js deve declarar VERSION = "X.Y.Z".');
  return match[1];
}

function writeVersion(directory, version) {
  writeFileSync(safePath(directory, "versions.js"),
    "// Fonte unica da versao do Mazestream.\n"
    + "// Os package.json e o package-lock.json nao declaram version; ajuste somente este arquivo.\n"
    + `const VERSION = ${JSON.stringify(version)};\n`
    + "module.exports = { VERSION };\n");
}

export function checkVersions(directory, { tag } = {}) {
  const readJson = (file) => JSON.parse(readFileSync(safePath(directory, file), "utf8"));
  const version = readVersion(directory);
  assert.ok(isReleaseVersion(version), "Versao invalida em versions.js: use X.Y.Z ou X.Y.Z-rc.1.");
  const noOwnVersion = (file, value) =>
    assert.equal(value, undefined, `${file} nao deve declarar version; a versao vive em versions.js.`);
  const pkg = readJson("package.json");
  assert.ok(Array.isArray(pkg.workspaces), "Declare os diretorios dos workspaces no package.json.");
  noOwnVersion("package.json", pkg.version);
  const lock = readJson("package-lock.json");
  noOwnVersion("package-lock.json", lock.version);
  noOwnVersion('package-lock.json packages[""]', lock.packages?.[""]?.version);
  for (const workspace of pkg.workspaces) {
    const child = readJson(`${workspace}/package.json`);
    noOwnVersion(`${workspace}/package.json`, child.version);
    noOwnVersion(`package-lock.json ${workspace}`, lock.packages?.[workspace]?.version);
  }
  if (tag !== undefined) assert.equal(tag, `v${version}`, "Tag e versao dos pacotes divergem.");
  return { ...pkg, version };
}

// SemVer identico ao npm: incrementar sobre uma candidata -rc.1 promove para a estavel.
export function incrementVersion(version, change) {
  const [core, prerelease] = version.split("-");
  const [major, minor, patch] = core.split(".").map(Number);
  if (change === "patch") return prerelease ? core : `${major}.${minor}.${patch + 1}`;
  if (change === "minor") return prerelease ? `${major}.${minor}.0` : `${major}.${minor + 1}.0`;
  if (change === "major") return `${major + 1}.0.0`;
  return change;
}

export function bumpVersion(directory, change) {
  assert.ok(["patch", "minor", "major"].includes(change) || isReleaseVersion(change),
    "Use patch, minor, major ou uma versao exata, como 1.2.1 ou 1.2.0-rc.1.");
  const version = checkVersions(directory).version;
  const next = incrementVersion(version, change);
  const file = safePath(directory, "versions.js");
  const original = readFileSync(file);
  try {
    writeVersion(directory, next);
    assert.notEqual(checkVersions(directory).version, version, "A versao nao foi alterada.");
    return { previous: version, version: next, files: ["versions.js"] };
  } catch (error) {
    writeFileSync(file, original);
    throw error;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [command, change, ...extra] = process.argv.slice(2);
    if (command === "check" && change === undefined) {
      const version = checkVersions(root, { tag: releaseTag() }).version;
      console.log(`Versao ${version}: vive somente em versions.js; manifests e lockfile nao declaram version.`);
    } else {
      assert.ok(command === "bump" && change && extra.length === 0,
        "Use npm run check:versions ou npm run version:set -- X.Y.Z (tambem: version:patch/minor/major).");
      const result = bumpVersion(root, change);
      console.log(`Versao ${result.previous} -> ${result.version} em versions.js.`);
      console.log("Nenhum commit, tag, push, release ou deploy foi feito. Execute npm run verify antes de publicar.");
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
