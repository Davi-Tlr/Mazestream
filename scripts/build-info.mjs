import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../", import.meta.url));

export function buildInfo(profile) {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  let revision = process.env.MAZESTREAM_REVISION || "unknown";
  let dirty = null;
  try {
    if (revision === "unknown") revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    dirty = Boolean(execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
  } catch { /* Fonte extraida sem .git: metadados desconhecidos, nao inventados. */ }
  if (!/^(unknown|[a-f0-9]{7,64})$/i.test(revision)) throw new Error("MAZESTREAM_REVISION deve ser um SHA Git ou unknown.");
  return { name: "Mazestream", version: pkg.version, profile, revision, dirty, builtAt: new Date().toISOString() };
}
