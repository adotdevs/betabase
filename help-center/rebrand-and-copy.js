const fs = require("fs");
const path = require("path");

const SOURCE = path.join(__dirname, "..", "savings-plans-and-earn");
const TARGET = path.join(__dirname, "..", "FE", "public", "help");

const REPLACEMENTS = [
  ["Acme Exchange", "Betabase"],
  ["https://example.com/contact", "https://www.betabase.pro/support"],
  ["https://example.com", "https://www.betabase.pro"],
  ["example.com", "www.betabase.pro"],
  ["Acme<span> Help</span>", "Betabase<span> Help</span>"],
  ["the Acme app", "the Betabase app"],
  ["Acme app", "Betabase app"],
  ["Search Acme help", "Search Betabase help"],
  ["a Betabase account", "a Betabase account"],
  ["open a Betabase", "open a Betabase"],
];

const walk = (dir, files = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
};

const rebrand = (content) => {
  let out = content;
  for (const [from, to] of REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  return out;
};

const copyDir = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
};

if (!fs.existsSync(SOURCE)) {
  console.error("Missing savings-plans-and-earn/ folder");
  process.exit(1);
}

if (fs.existsSync(TARGET)) {
  fs.rmSync(TARGET, { recursive: true, force: true });
}

copyDir(SOURCE, TARGET);

const textExtensions = new Set([".html", ".json", ".xml", ".js", ".css"]);
const files = walk(TARGET).filter((file) => textExtensions.has(path.extname(file)));

let changed = 0;
for (const file of files) {
  const original = fs.readFileSync(file, "utf8");
  const updated = rebrand(original);
  if (updated !== original) {
    fs.writeFileSync(file, updated, "utf8");
    changed += 1;
  }
}

console.log(`Copied help center to FE/public/help/`);
console.log(`Rebranded ${changed} files for Betabase.`);
