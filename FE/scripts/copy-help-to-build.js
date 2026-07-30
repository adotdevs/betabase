const fs = require("fs");
const path = require("path");

const source = path.join(__dirname, "../public/help");
const target = path.join(__dirname, "../build/help");

if (!fs.existsSync(source)) {
  console.warn("copy-help-build: FE/public/help missing, skipping");
  process.exit(0);
}

fs.cpSync(source, target, { recursive: true });
console.log(`copy-help-build: synced ${source} -> ${target}`);
