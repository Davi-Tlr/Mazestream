import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { root } from "./build-info.mjs";
import { safePath } from "./release-lib.mjs";
import { bumpVersion, checkVersions, isReleaseVersion, releaseTag } from "./versions.mjs";

const manifestFiles = ["package.json", "frontend/package.json", "discord-relay/package.json", "package-lock.json"];

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
  const workspaces = ["frontend", "discord-relay"];
  const scripts = { preversion: "node -e \"process.exit(91)\"", postversion: "node -e \"process.exit(92)\"" };
  put("package.json", { name: "mazestream-version-fixture", version, private: true, workspaces, scripts });
  const packages = { "": { name: "mazestream-version-fixture", version, workspaces } };
  for (const workspace of workspaces) {
    const name = `@mazestream/${workspace}`;
    put(`${workspace}/package.json`, { name, version, private: true, scripts });
    packages[workspace] = { name, version };
    packages[`node_modules/${name}`] = { resolved: workspace, link: true };
  }
  put("package-lock.json", { name: "mazestream-version-fixture", version, lockfileVersion: 3, requires: true, packages });
  put(".npmrc", `cache=${base.replaceAll("\\", "/")}/npm-cache\n`);
  return { base, put, read };
}

const snapshot = (base) => manifestFiles.map((file) => readFileSync(safePath(base, file), "utf8"));

test("release versions accept stable and prerelease identifiers without ambiguous numbers", () => {
  for (const version of ["0.1.0", "1.2.1", "1.1.2", "1.2.0-rc.1", "1.2.0-0", "1.2.0-alpha-01"]) {
    assert.ok(isReleaseVersion(version), version);
  }
  for (const version of [null, 123, "", "v1.2.1", "1.2", "01.2.1", "1.02.1", "1.2.01", "1.2.0-rc.01", "1.2.0-", "1.2.0-rc..1", "1.2.0\n", "1.2.0+build", "9007199254740992.0.0"]) {
    assert.equal(isReleaseVersion(version), false, String(version));
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

for (const file of manifestFiles.slice(0, 3)) {
  test(`version check rejects a divergent manifest: ${file}`, (t) => {
    const { base, read, put } = fixture(t);
    const pkg = read(file);
    pkg.version = "1.2.2";
    put(file, pkg);
    assert.throws(() => checkVersions(base), /Versao divergente/);
  });
}

for (const entry of [null, "", "frontend", "discord-relay"]) {
  test(`version check rejects stale lock metadata: ${entry === null ? "top level" : entry || "root"}`, (t) => {
    const { base, read, put } = fixture(t);
    const lock = read("package-lock.json");
    if (entry === null) lock.version = "1.2.0";
    else lock.packages[entry].version = "1.2.0";
    put("package-lock.json", lock);
    assert.throws(() => checkVersions(base), /Versao divergente/);
  });
}

test("version check rejects missing workspace lock entries", (t) => {
  const { base, read, put } = fixture(t);
  const lock = read("package-lock.json");
  delete lock.packages.frontend;
  put("package-lock.json", lock);
  assert.throws(() => checkVersions(base), /Versao divergente/);
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
  test(`npm bumps all manifests and the lock together: ${from} -> ${expected}`, (t) => {
    const { base, read } = fixture(t, from);
    const result = bumpVersion(base, change, { stdio: "pipe" });
    assert.equal(result.previous, from);
    assert.equal(result.version, expected);
    assert.deepEqual(result.files, manifestFiles);
    assert.equal(checkVersions(base, { tag: `v${expected}` }).version, expected);
    assert.deepEqual(read("package.json").scripts, { preversion: "node -e \"process.exit(91)\"", postversion: "node -e \"process.exit(92)\"" });
    assert.equal(existsSync(path.join(base, "node_modules")), false, "A bump must not install dependencies.");
    assert.equal(existsSync(path.join(base, ".git")), false);
  });
}

test("a real project lockfile keeps its dependency graph when bumping", (t) => {
  const { base, put, read } = fixture(t);
  for (const file of manifestFiles) put(file, readFileSync(path.join(root, file), "utf8"));
  const before = manifestFiles.map(read);
  bumpVersion(base, "patch", { stdio: "pipe" });
  const after = manifestFiles.map(read);
  for (let i = 0; i < 3; i++) after[i].version = before[i].version;
  after[3].version = before[3].version;
  for (const workspace of ["", ...before[0].workspaces]) after[3].packages[workspace].version = before[3].packages[workspace].version;
  assert.deepEqual(after, before, "Versioning must not change dependencies or other manifest fields.");
});

test("npm aliases and the standalone CI check work without installed dependencies", (t) => {
  const { base, put, read } = fixture(t);
  for (const file of ["scripts/versions.mjs", "scripts/build-info.mjs", "scripts/release-lib.mjs"]) {
    put(file, readFileSync(path.join(root, file), "utf8"));
  }
  const scripts = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts;
  put("package.json", { ...read("package.json"), scripts: { "version:set": scripts["version:set"] } });
  const run = (args, env = {}) => execFileSync(process.execPath, args, {
    cwd: base, encoding: "utf8", stdio: "pipe", timeout: 30_000,
    env: { ...process.env, GITHUB_REF_TYPE: "branch", ...env }
  });
  assert.match(run(["scripts/versions.mjs", "check"]), /Versao 1\.2\.1/);
  assert.match(run([process.env.npm_execpath, "run", "version:set", "--", "1.3.2"]), /Nenhum commit, tag, push/);
  assert.equal(checkVersions(base).version, "1.3.2");
  const before = snapshot(base);
  assert.throws(() => run([process.env.npm_execpath, "run", "version:set"]));
  assert.throws(() => run(["scripts/versions.mjs", "check"], { GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: "v1.3.1" }));
  assert.match(run(["scripts/versions.mjs", "check"], { GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: "v1.3.2" }), /Versao 1\.3\.2/);
  assert.deepEqual(snapshot(base), before);
  assert.equal(existsSync(path.join(base, "node_modules")), false);
});

test("invalid arguments and divergent versions do not write any manifest", (t) => {
  const { base, put, read } = fixture(t);
  let before = snapshot(base);
  for (const change of [undefined, "", "from-git", "--force", "--git-tag-version", "v1.3.0", "1.02.0"]) {
    assert.throws(() => bumpVersion(base, change), /Use patch/);
    assert.deepEqual(snapshot(base), before);
  }
  put("frontend/package.json", { ...read("frontend/package.json"), version: "1.2.0" });
  before = snapshot(base);
  assert.throws(() => bumpVersion(base, "patch"), /Versao divergente/);
  assert.deepEqual(snapshot(base), before);
});

test("failed or incomplete npm updates restore the original files", (t) => {
  const { base, put } = fixture(t);
  const before = snapshot(base);
  for (const exitCode of [0, 1]) {
    put("partial-npm.cjs", `require('node:fs').writeFileSync('frontend/package.json', '{"version":"9.0.0"}'); process.exitCode = ${exitCode};`);
    assert.throws(() => bumpVersion(base, "patch", { npmCli: path.join(base, "partial-npm.cjs"), stdio: "pipe" }));
    assert.deepEqual(snapshot(base), before);
  }
});

test("npm cannot create Git commits/tags or execute lifecycle hooks during a bump", (t) => {
  const { base, put } = fixture(t);
  put("inspect-npm.cjs", "require('node:fs').writeFileSync('npm-args.json', JSON.stringify(process.argv.slice(2))); process.exitCode = 1;");
  assert.throws(() => bumpVersion(base, "minor", { npmCli: path.join(base, "inspect-npm.cjs"), stdio: "pipe" }));
  const args = JSON.parse(readFileSync(path.join(base, "npm-args.json"), "utf8"));
  for (const flag of ["--no-git-tag-version", "--ignore-scripts", "--offline", "--package-lock-only", "--workspaces", "--include-workspace-root"]) assert.ok(args.includes(flag), flag);
  assert.deepEqual(args.slice(0, 2), ["version", "minor"]);
});
