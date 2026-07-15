import EuroLogo from "../../../../assets/images/new/euro.svg";
import DollarLogo from "../../../../assets/images/new/dollar.svg";
import ChfLogo from "../../../../assets/images/new/chf.svg";
import DkkLogo from "../../../../assets/images/new/dkk.svg";
import { CORE_COINS, coinLogos } from "./coinConfig";
import { getFiatCurrencyByName } from "../../../../utils/euroCoinUtils";
import { isSwapTransaction, trxNameToSymbol } from "./swapTransactionUtils";

export const resolveTransactionCoinMeta = (trxName) => {
  const key = String(trxName || "").toLowerCase().trim();
  const core = CORE_COINS.find((coin) => coin.trxName === key);

  if (core) {
    return {
      name: core.name,
      symbol: core.symbol,
      logo: core.logo,
      accent: core.accent,
    };
  }

  const fiat = getFiatCurrencyByName(key);
  if (fiat) {
    const logoMap = {
      euro: EuroLogo,
      dollar: DollarLogo,
      "swiss franc": ChfLogo,
      "danish krone": DkkLogo,
    };
    const accentMap = {
      euro: "#2563EB",
      dollar: "#16a34a",
      "swiss franc": "#dc2626",
      "danish krone": "#c2410c",
    };
    return {
      name: fiat.coinName,
      symbol: fiat.label,
      logo: logoMap[fiat.key] || null,
      accent: accentMap[fiat.key] || "#5B8DEF",
    };
  }

  return {
    name: trxName || "Unknown",
    symbol: trxNameToSymbol(trxName),
    logo: coinLogos[key] || null,
    accent: "#5B8DEF",
  };
};

export const getTransactionTypeLabel = (transaction, swapDetails) => {
  if (isSwapTransaction(transaction)) {
    return "Swap";
  }
  if (transaction.type === "deposit") {
    return "Deposit";
  }
  if (transaction.type === "withdraw") {
    return "Withdraw";
  }
  return parseFloat(transaction.amount || 0) >= 0 ? "Received" : "Sent";
};

export const getStatusTone = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("completed")) return "completed";
  if (normalized.includes("pending")) return "pending";
  if (normalized.includes("rejected") || normalized.includes("failed")) return "rejected";
  return "unknown";
};

export const formatTransactionDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Today ${time}`;

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatSmartAmount = (value) => {
  const num = Math.abs(Number(value));
  if (!Number.isFinite(num) || num === 0) return "0";

  if (num >= 1000) {
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (num >= 1) {
    return num.toFixed(4).replace(/\.?0+$/, "");
  }
  if (num >= 0.0001) {
    return num.toFixed(6).replace(/\.?0+$/, "");
  }

  return num.toFixed(8).replace(/\.?0+$/, "") || "0";
};

export const formatStatusLabel = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("completed")) return "Completed";
  if (normalized.includes("pending")) return "Pending";
  if (normalized.includes("rejected")) return "Rejected";
  if (normalized.includes("failed")) return "Failed";
  return status || "Unknown";
};
