/**
 * Post-build asset copy.
 * Copies PNG identity-slip templates from src/ into dist/ so they are
 * available at runtime in production (tsc only outputs .js files).
 *
 * Called automatically by `npm run build` via the && chain.
 * Safe to run multiple times — copyFileSync overwrites existing files.
 */

const fs   = require("fs");
const path = require("path");

const SRC_DIR  = path.resolve(__dirname, "../src/modules/transactions/pdf/templates");
const DEST_DIR = path.resolve(__dirname, "../dist/modules/transactions/pdf/templates");

const PNG_TEMPLATES = [
  "NIN Information.png",
  "NIN Standard.png",
  "NIN Premium.png",
  "BVN.png",
];

fs.mkdirSync(DEST_DIR, { recursive: true });

let ok = 0;
for (const file of PNG_TEMPLATES) {
  const src  = path.join(SRC_DIR,  file);
  const dest = path.join(DEST_DIR, file);
  if (!fs.existsSync(src)) {
    console.error(`[copy-assets] MISSING source: ${src}`);
    process.exit(1);
  }
  fs.copyFileSync(src, dest);
  console.log(`[copy-assets] ${file}`);
  ok++;
}

console.log(`[copy-assets] ${ok}/${PNG_TEMPLATES.length} templates copied → ${DEST_DIR}`);
