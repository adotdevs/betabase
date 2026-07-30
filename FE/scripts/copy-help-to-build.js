const fs = require("fs");
const path = require("path");

const source = path.join(__dirname, "../public/help");
const target = path.join(__dirname, "../build/help");

const copyRecursive = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

if (!fs.existsSync(source)) {
  console.warn("copy-help-build: FE/public/help missing, skipping");
  process.exit(0);
}

if (fs.existsSync(target)) {
  fs.rmSync(target, { recursive: true, force: true });
}

if (typeof fs.cpSync === "function") {
  fs.cpSync(source, target, { recursive: true });
} else {
  copyRecursive(source, target);
}

console.log(`copy-help-build: synced ${source} -> ${target}`);
