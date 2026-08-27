const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DIST = path.join(__dirname, "..", "dist");
const COMPRESSIBLE = new Set([".css", ".html", ".js", ".json", ".mjs", ".svg", ".webmanifest"]);
const MIN_BYTES = 1024;

function visit(directory, totals) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      visit(filePath, totals);
      continue;
    }
    if (!COMPRESSIBLE.has(path.extname(entry.name).toLowerCase())) continue;
    const source = fs.readFileSync(filePath);
    if (source.length < MIN_BYTES) continue;

    const brotli = zlib.brotliCompressSync(source, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 }
    });
    const gzip = zlib.gzipSync(source, { level: 9 });
    fs.writeFileSync(filePath + ".br", brotli);
    fs.writeFileSync(filePath + ".gz", gzip);
    totals.files += 1;
    totals.raw += source.length;
    totals.br += brotli.length;
    totals.gzip += gzip.length;
  }
}

if (!fs.existsSync(DIST)) {
  console.error("dist/ nao existe. Rode o build do Vite primeiro.");
  process.exit(1);
}

const totals = { files: 0, raw: 0, br: 0, gzip: 0 };
visit(DIST, totals);
console.log(
  "Precompressao: " + totals.files + " arquivos | "
  + Math.round(totals.raw / 1024) + " KiB -> "
  + Math.round(totals.br / 1024) + " KiB Brotli / "
  + Math.round(totals.gzip / 1024) + " KiB gzip"
);
