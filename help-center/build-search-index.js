const fs = require("fs");
const path = require("path");

const HELP_ROOT = path.join(__dirname, "..", "FE", "public", "help");
const OUT_FILE = path.join(HELP_ROOT, "search-index.json");

const CATEGORIES = {
  "getting-started": "Getting started",
  "account-and-security": "Account & security",
  "verification-kyc": "Verification (KYC)",
  "deposits-and-funding": "Deposits & funding",
  withdrawals: "Withdrawals",
  "buying-selling-and-swapping": "Buying, selling & swapping",
  "fees-and-limits": "Fees & limits",
  "savings-plans-and-earn": "Savings plans & Earn",
  "troubleshooting-and-self-service": "Troubleshooting & self-service",
  "legal-tax-and-compliance": "Legal, tax & compliance",
  "contact-and-support": "Contact & support",
};

const decode = (value) =>
  String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&rsquo;|&lsquo;/gi, "'")
    .replace(/&rdquo;|&ldquo;/gi, '"')
    .replace(/&mdash;|&ndash;/gi, "-")
    .replace(/&hellip;/gi, "...")
    .replace(/&rsaquo;/gi, ">")
    .replace(/&#\d+;/g, " ");

const stripHtml = (html) =>
  decode(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();

const matchAttr = (html, tag, attr) => {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["'][^>]*>`, "i");
  const match = html.match(re);
  return match ? decode(match[1]) : "";
};

const matchTag = (html, tag) => {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = html.match(re);
  return match ? stripHtml(match[1]) : "";
};

const walkHtml = (dir, files = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, files);
    else if (entry.name.endsWith(".html")) files.push(full);
  }
  return files;
};

const toUrl = (file) => {
  const rel = path.relative(HELP_ROOT, file).split(path.sep).join("/");
  if (rel === "index.html") return "/help/";
  if (rel.endsWith("/index.html")) return `/help/${rel.slice(0, -10)}`;
  return `/help/${rel}`;
};

const files = walkHtml(HELP_ROOT);
const index = [];

for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  const rel = path.relative(HELP_ROOT, file).split(path.sep).join("/");
  const folder = rel.includes("/") ? rel.split("/")[0] : "";
  const isHome = rel === "index.html";
  const isCategory = /(?:^|\/)index\.html$/.test(rel) && !isHome;
  const title =
    matchTag(html, "h1") ||
    stripHtml(matchTag(html, "title")).replace(/\s*\|.*$/, "") ||
    rel;
  const description = matchAttr(html, "meta", "content");
  const articleHtml = (html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) || [])[1] || "";
  const mainHtml = (html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) || [])[1] || html;
  const body = stripHtml(articleHtml || mainHtml);
  const category = isHome
    ? "Help centre"
    : CATEGORIES[folder] || folder.replace(/-/g, " ");
  const keywords = [
    title,
    category,
    description,
    isCategory ? "category topic browse articles" : "",
    path.basename(file, ".html").replace(/-/g, " "),
  ]
    .filter(Boolean)
    .join(", ");

  index.push({
    t: title,
    c: category,
    u: toUrl(file),
    k: keywords,
    b: body,
    s: body.slice(0, 240),
  });
}

index.sort((a, b) => a.c.localeCompare(b.c) || a.t.localeCompare(b.t));
fs.writeFileSync(OUT_FILE, JSON.stringify(index));
console.log(`Indexed ${index.length} help pages -> ${path.relative(process.cwd(), OUT_FILE)}`);
