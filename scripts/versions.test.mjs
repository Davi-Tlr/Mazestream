import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { root } from "./build-info.mjs";
import { safePath } from "./release-lib.mjs";
import { bumpVersion, checkVersions, incrementVersion, isReleaseVersion, releaseTag } from "./versions.mjs";

// versions.js e o unico arquivo que declara a versao; os manifests e o
// lockfile nao devem conter version propria.
const versionFiles = ["versions.js", "package.json", "frontend/package.json", "discord-relay/package.json", "package-lock.json"];

function fixture(t, version = "1.2.1") {
  const base = mkdtempSync(path.join(tmpdir(), "mazestream-versions-test-"));
  t.after(() => {
    const absolute = path.resolve(base);
    assert.equal(path.dirname(absolute), path.resolve(tmpdir()));
    assert.ok(path.basename(absolute).startsWith("mazestream-versions-test-"));
    rmSync(absolute, { recursive: true, force: true });
  });
  const put = (file, value) => {
    const target = safePath(base, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
  };
  const read = (file) => JSON.parse(readFileSync(safePath(base, file), "utf8"));
  const readText = (file) => readFileSync(safePath(base, file), "utf8");
  const versionContent = (value) => `const VERSION = "${value}";\nmodule.exports = { VERSION };\n`;
  const workspaces = ["frontend", "discord-relay"];
  const scripts = { preversion: "node -e \"process.exit(91)\"", postversion: "node -e \"process.exit(92)\"" };
  put("versions.js", versionContent(version));
  put("package.json", { name: "mazestream-version-fixture", private: true, workspaces, scripts });
  const packages = { "": { name: "mazestream-version-fixture", workspaces } };
  for (const workspace of workspaces) {
    const name = `@mazestream/${workspace}`;
    put(`${workspace}/package.json`, { name, private: true, scripts });
    packages[workspace] = { name };
    packages[`node_modules/${name}`] = { resolved: workspace, link: true };
  }
  put("package-lock.json", { name: "mazestream-version-fixture", lockfileVersion: 3, requires: true, packages });
  return { base, put, read, readText, versionContent };
}

const snapshot = (base) => versionFiles.map((file) => readFileSync(safePath(base, file), "utf8"));

test("release versions accept stable and prerelease identifiers without ambiguous numbers", () => {
  for (const version of ["0.1.0", "1.2.1", "1.1.2", "1.2.0-rc.1", "1.2.0-0", "1.2.0-alpha-01"]) {
    assert.ok(isReleaseVersion(version), version);
  }
  for (const version of [null, 123, "", "v1.2.1", "1.2", "01.2.1", "1.02.1", "1.2.01", "1.2.0-rc.01", "1.2.0-", "1.2.0-rc..1", "1.2.0\n", "1.2.0+build", "9007199254740992.0.0"]) {
    assert.equal(isReleaseVersion(version), false, String(version));
  }
});

test("incrementVersion matches npm SemVer behavior, including prerelease promotion", () => {
  for (const [from, change, expected] of [
    ["1.2.1", "patch", "1.2.2"],
    ["1.1.1", "patch", "1.1.2"],
    ["1.2.1", "minor", "1.3.0"],
    ["1.2.1", "major", "2.0.0"],
    ["1.3.0-rc.1", "patch", "1.3.0"],
    ["1.3.0-rc.1", "minor", "1.3.0"],
    ["1.3.0-rc.1", "major", "2.0.0"],
    ["1.0.1", "1.2.1", "1.2.1"],
    ["1.2.1", "1.3.0-rc.1", "1.3.0-rc.1"]
  ]) {
    assert.equal(incrementVersion(from, change), expected, `${from} ${change}`);
  }
});

test("version check is read-only and accepts a matching tag", (t) => {
  const { base } = fixture(t);
  const before = snapshot(base);
  assert.equal(checkVersions(base, { tag: "v1.2.1" }).version, "1.2.1");
  assert.deepEqual(snapshot(base), before);
  for (const tag of ["v1.2.2", "1.2.1", ""]) assert.throws(() => checkVersions(base, { tag }), /Tag e versao/);
  assert.equal(releaseTag({ GITHUB_REF_TYPE: "branch", GITHUB_REF_NAME: "main" }), undefined);
  assert.equal(releaseTag({ GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: "v1.2.1" }), "v1.2.1");
  assert.equal(releaseTag({ GITHUB_REF_TYPE: "tag" }), "");
});

for (const file of ["package.json", "frontend/package.json", "discord-relay/package.json"]) {
  test(`manifests must not declare their own version: ${file}`, (t) => {
    const { base, read, put } = fixture(t);
    const pkg = read(file);
    pkg.version = "1.2.1";
    put(file, pkg);
    assert.throws(() => checkVersions(base), /versions\.js/);
  });
}

for (const entry of [null, "", "frontend", "discord-relay"]) {
  test(`lockfile must not declare its own version: ${entry === null ? "top level" : entry || "root"}`, (t) => {
    const { base, read, put } = fixture(t);
    const lock = read("package-lock.json");
    if (entry === null) lock.version = "1.2.1";
    else lock.packages[entry].version = "1.2.1";
    put("package-lock.json", lock);
    assert.throws(() => checkVersions(base), /versions\.js/);
  });
}

test("an invalid versions.js is rejected", (t) => {
  const { base, put } = fixture(t);
  put("versions.js", "const VERSION = \"xyz\";\nmodule.exports = { VERSION };\n");
  assert.throws(() => checkVersions(base), /Versao invalida em versions\.js/);
});

for (const [from, change, expected] of [
  ["1.2.1", "patch", "1.2.2"],
  ["1.1.1", "patch", "1.1.2"],
  ["1.2.1", "minor", "1.3.0"],
  ["1.2.1", "major", "2.0.0"],
  ["1.0.1", "1.2.1", "1.2.1"],
  ["1.2.1", "1.3.0-rc.1", "1.3.0-rc.1"],
  ["1.3.0-rc.1", "patch", "1.3.0"]
]) {
  test(`bump changes only versions.js: ${from} -> ${expected}`, (t) => {
    const { base, readText } = fixture(t, from);
    const before = snapshot(base);
    const result = bumpVersion(base, change);
    assert.equal(result.previous, from);
    assert.equal(result.version, expected);
    assert.deepEqual(result.files, ["versions.js"]);
    assert.equal(checkVersions(base, { tag: `v${expected}` }).version, expected);
    assert.match(readText("versions.js"), new RegExp(`VERSION = "${expected}"`));
    const after = snapshot(base);
    assert.deepEqual(after.slice(1), before.slice(1), "Manifests e lockfile nao mudam; somente versions.js.");
    assert.equal(existsSync(path.join(base, "node_modules")), false, "Uma bump nao instala dependencias.");
    assert.equal(existsSync(path.join(base, ".git")), false);
  });
}

test("bumping a real project leaves manifests and the lockfile untouched", (t) => {
  const { base, put, readText } = fixture(t);
  for (const file of versionFiles) put(file, readFileSync(path.join(root, file), "utf8"));
  const before = snapshot(base);
  bumpVersion(base, "patch");
  const after = snapshot(base);
  assert.deepEqual(after.slice(1), before.slice(1), "Versioning must not change dependencies or other manifest fields.");
  assert.notEqual(after[0], before[0]);
  assert.match(readText("versions.js"), /VERSION = "1\.0\.2"/);
});

test("the standalone CLI check and bump commands work without installed dependencies", (t) => {
  const { base, put } = fixture(t);
  for (const file of ["scripts/versions.mjs", "scripts/build-info.mjs", "scripts/release-lib.mjs"]) {
    put(file, readFileSync(path.join(root, file), "utf8"));
  }
  const run = (args, env = {}) => execFileSync(process.execPath, args, {
    cwd: base, encoding: "utf8", stdio: "pipe", timeout: 30_000,
    env: { ...process.env, GITHUB_REF_TYPE: "branch", ...env }
  });
  assert.match(run(["scripts/versions.mjs", "check"]), /Versao 1\.2\.1/);
  assert.match(run(["scripts/versions.mjs", "bump", "1.3.2"]), /Versao 1\.2\.1 -> 1\.3\.2/);
  assert.equal(checkVersions(base).version, "1.3.2");
  const before = snapshot(base);
  assert.throws(() => run(["scripts/versions.mjs", "bump"]), /Use npm run/);
  assert.throws(() => run(["scripts/versions.mjs", "check"], { GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: "v1.3.1" }));
  assert.match(run(["scripts/versions.mjs", "check"], { GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: "v1.3.2" }), /Versao 1\.3\.2/);
  assert.deepEqual(snapshot(base), before);
  assert.equal(existsSync(path.join(base, "node_modules")), false);
});

test("lifecycle hooks and git are never triggered; a bump has no side effects", (t) => {
  const { base, put, readText } = fixture(t);
  put("scripts/versions.mjs", readFileSync(path.join(root, "scripts/versions.mjs"), "utf8"));
  const before = snapshot(base);
  const result = bumpVersion(base, "major");
  assert.equal(result.version, "2.0.0");
  assert.deepEqual(snapshot(base).slice(1), before.slice(1));
  assert.equal(existsSync(path.join(base, "node_modules")), false);
  assert.equal(existsSync(path.join(base, ".git")), false);
  assert.match(readText("versions.js"), /VERSION = "2\.0\.0"/);
});

test("invalid changes and rejected states do not write any file", (t) => {
  const { base, read, put } = fixture(t);
  let before = snapshot(base);
  for (const change of [undefined, "", "from-git", "--force", "--git-tag-version", "v1.3.0", "1.02.0"]) {
    assert.throws(() => bumpVersion(base, change), /Use patch/);
    assert.deepEqual(snapshot(base), before);
  }
  put("package.json", { ...read("package.json"), version: "1.2.1" });
  before = snapshot(base);
  assert.throws(() => bumpVersion(base, "patch"), /versions\.js/);
  assert.deepEqual(snapshot(base), before);
});