import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../", import.meta.url));

const require = createRequire(import.meta.url);
const { VERSION } = require("../versions.js");

export function buildInfo(profile) {
  let revision = process.env.MAZESTREAM_REVISION || "unknown";
  let dirty = null;
  try {
    if (revision === "unknown") revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    dirty = Boolean(execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
  } catch { /* Fonte extraida sem .git: metadados desconhecidos, nao inventados. */ }
  if (!/^(unknown|[a-f0-9]{7,64})$/i.test(revision)) throw new Error("MAZESTREAM_REVISION deve ser um SHA Git ou unknown.");
  return { name: "Mazestream", version: VERSION, profile, revision, dirty, builtAt: new Date().toISOString() };
}
