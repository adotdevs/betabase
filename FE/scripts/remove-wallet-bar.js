const fs = require("fs");
const path = require("path");

const files = [
  "src/jsx/pages/user/Account.js",
  "src/jsx/pages/user/AffiliateDashboard.jsx",
  "src/jsx/pages/user/AiTradingBot.js",
  "src/jsx/pages/user/AllTicket.js",
  "src/jsx/pages/user/ApplyLoan.js",
  "src/jsx/pages/user/Asssets.js",
  "src/jsx/pages/user/createTicketpg.js",
  "src/jsx/pages/user/creditCard.js",
  "src/jsx/pages/user/Dashboard.js",
  "src/jsx/pages/user/Documents.js",
  "src/jsx/pages/user/editProfile.js",
  "src/jsx/pages/user/Exchange.js",
  "src/jsx/pages/user/Kyc.js",
  "src/jsx/pages/user/Letter.js",
  "src/jsx/pages/user/Market.js",
  "src/jsx/pages/user/ReferralPromo.jsx",
  "src/jsx/pages/user/Staking.js",
  "src/jsx/pages/user/Stocks.js",
  "src/jsx/pages/user/Support.js",
  "src/jsx/pages/user/Swap.js",
  "src/jsx/pages/user/Tokens.js",
  "src/jsx/pages/user/Transactions.js",
  "src/jsx/router/index.jsx",
];

const root = path.join(__dirname, "..");

for (const rel of files) {
  const filePath = path.join(root, rel);
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, "utf8");
  const original = content;

  content = content.replace(/^import RightWalletBar from .+\r?\n/m, "");
  content = content.replace(/\r?\n\s*<RightWalletBar\s*\/>\s*\r?\n/g, "\n");
  content = content.replace(/\{ sidebariconHover, headWallet \}/g, "{ sidebariconHover }");
  content = content.replace(/\{sidebariconHover, headWallet\}/g, "{ sidebariconHover }");
  content = content.replace(/show wallet-open \$\{headWallet \? "" : "active"\} /g, "show ");
  content = content.replace(/show wallet-open \$\{headWallet \? "" : 'active'\} /g, "show ");
  content = content.replace(/\{\/\* <RightWalletBar \/> \*\/\}\r?\n?/g, "");

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log("patched", rel);
  }
}
