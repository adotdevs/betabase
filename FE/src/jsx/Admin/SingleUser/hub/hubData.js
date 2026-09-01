import { isSwapTransaction } from "../../../pages/report/assets/swapTransactionUtils";
import { getTransactionsForCoin } from "../../../pages/report/assets/coinConfig";
import {
  getFiatUsdEquivalent,
  isFiatCoin,
} from "../../../../utils/euroCoinUtils";

export const HUB_TABS = [
  { id: "overview", label: "Overview" },
  { id: "assets", label: "Assets & Banking" },
  { id: "transactions", label: "Transactions" },
  { id: "compliance", label: "Compliance & Applications" },
  { id: "portfolio", label: "Portfolio" },
];

export const isStaffProfile = (user) =>
  user?.role === "admin" || user?.role === "subadmin";

export const OLD_ROUTE_TAB = {
  general: "overview",
  assets: "assets",
  "crypto-card": "assets",
  "bank-accounts": "assets",
  "euro-account": "assets",
  "usd-account": "assets",
  "chf-account": "assets",
  "dkk-account": "assets",
  transactions: "transactions",
  documents: "compliance",
  verifications: "compliance",
  "loan-application": "compliance",
  tokens: "portfolio",
  staking: "portfolio",
};

const PERIOD_DAYS = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };

export const periodDays = (key) => PERIOD_DAYS[key] || 30;

export const txTime = (tx) => {
  const value = tx?.createdAt || tx?.updatedAt;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

export const txAmount = (tx) => Math.abs(Number(tx?.amount) || 0);

export const isDeposit = (tx) =>
  !isSwapTransaction(tx) && (tx?.type === "deposit" || Number(tx?.amount) > 0);

export const isWithdraw = (tx) =>
  !isSwapTransaction(tx) && (tx?.type === "withdraw" || Number(tx?.amount) < 0);

export const inRange = (tx, start, end) => {
  const date = txTime(tx);
  return Boolean(date && date >= start && date <= end);
};

export const rangeForPeriod = (period) => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - periodDays(period));
  return { start, end };
};

export const fiatValue = (tx, prices = {}) => {
  const amount = txAmount(tx);
  if (isFiatCoin(tx?.trxName)) {
    return Number(getFiatUsdEquivalent(amount, tx.trxName)) || amount;
  }
  const key = String(tx?.trxName || "").toLowerCase();
  const price = Number(prices[key]) || 0;
  return amount * price;
};

export const summarizeTransactions = (transactions = [], prices = {}) => {
  let deposits = 0;
  let withdrawals = 0;
  let swaps = 0;
  let depositCount = 0;
  let withdrawCount = 0;
  let swapCount = 0;

  transactions.forEach((tx) => {
    const value = fiatValue(tx, prices);
    if (isSwapTransaction(tx)) {
      swaps += value;
      swapCount += 1;
      return;
    }
    if (isDeposit(tx)) {
      deposits += value;
      depositCount += 1;
      return;
    }
    if (isWithdraw(tx)) {
      withdrawals += value;
      withdrawCount += 1;
    }
  });

  return {
    deposits,
    withdrawals,
    swaps,
    depositCount,
    withdrawCount,
    swapCount,
    net: deposits - withdrawals,
  };
};

export const trendPercent = (current, previous) => {
  if (!Number.isFinite(previous) || previous === 0) return null;
  if (!Number.isFinite(current)) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
};

export const comparePeriods = (transactions, prices, period = "30d") => {
  const days = periodDays(period);
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setDate(currentStart.getDate() - days);
  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - days);

  const current = summarizeTransactions(
    transactions.filter((tx) => inRange(tx, currentStart, now)),
    prices
  );
  const previous = summarizeTransactions(
    transactions.filter((tx) => inRange(tx, previousStart, currentStart)),
    prices
  );

  return {
    current,
    previous,
    depositTrend: trendPercent(current.deposits, previous.deposits),
    withdrawTrend: trendPercent(current.withdrawals, previous.withdrawals),
  };
};

const dayKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const buildFlowSeries = (transactions = [], prices = {}, period = "30d") => {
  const { start, end } = rangeForPeriod(period);
  const buckets = new Map();
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);

  while (cursor <= last) {
    buckets.set(dayKey(cursor), { date: dayKey(cursor), deposits: 0, withdrawals: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  let used = 0;
  transactions.forEach((tx) => {
    const date = txTime(tx);
    if (!date || date < start || date > end) return;
    const bucket = buckets.get(dayKey(date));
    if (!bucket) return;
    const value = fiatValue(tx, prices);
    if (isSwapTransaction(tx)) return;
    if (isDeposit(tx)) bucket.deposits += value;
    if (isWithdraw(tx)) bucket.withdrawals += value;
    used += 1;
  });

  return { points: Array.from(buckets.values()), hasData: used > 0 };
};

export const buildNetSeries = (transactions = [], prices = {}, period = "30d") => {
  const { points, hasData } = buildFlowSeries(transactions, prices, period);
  let running = 0;
  return {
    hasData,
    points: points.map((point) => {
      running += point.deposits - point.withdrawals;
      return { date: point.date, net: running, deposits: point.deposits, withdrawals: point.withdrawals };
    }),
  };
};

export const buildTypeBreakdown = (transactions = [], prices = {}) => {
  const summary = summarizeTransactions(transactions, prices);
  return [
    { name: "Deposits", value: summary.deposits },
    { name: "Withdrawals", value: summary.withdrawals },
    { name: "Swaps", value: summary.swaps },
  ].filter((item) => item.value > 0);
};

export const collectAssetRows = (coinDoc, prices = {}) => {
  if (!coinDoc) return [];
  const txs = coinDoc.transactions || [];
  const rows = [
    { key: "bitcoin", name: "Bitcoin", symbol: "BTC", balance: getTransactionsForCoin("bitcoin", txs), price: Number(prices.bitcoin) || 0 },
    { key: "ethereum", name: "Ethereum", symbol: "ETH", balance: getTransactionsForCoin("ethereum", txs), price: Number(prices.ethereum) || 0 },
    { key: "tether", name: "Tether", symbol: "USDT", balance: getTransactionsForCoin("tether", txs), price: Number(prices.tether) || 1 },
  ];

  (coinDoc.additionalCoins || []).forEach((coin) => {
    const trxName = String(coin.coinName || "").toLowerCase();
    rows.push({
      key: trxName,
      name: coin.coinName,
      symbol: String(coin.coinSymbol || "").toUpperCase(),
      balance: getTransactionsForCoin(trxName, txs),
      price: isFiatCoin(coin.coinName)
        ? Number(getFiatUsdEquivalent(1, coin.coinName)) || 1
        : Number(prices[trxName]) || 0,
      fiat: isFiatCoin(coin.coinName),
    });
  });

  return rows.map((row) => ({
    ...row,
    value: (Number(row.balance) || 0) * (Number(row.price) || 0),
  }));
};

export const buildAllocation = (rows = []) =>
  rows
    .filter((row) => row.value > 0)
    .map((row) => ({ name: row.symbol || row.name, value: row.value }));

export const buildActivityItems = ({ transactions = [], loan }) => {
  const items = [];

  transactions
    .slice()
    .sort((a, b) => (txTime(b)?.getTime() || 0) - (txTime(a)?.getTime() || 0))
    .slice(0, 8)
    .forEach((tx) => {
      const date = txTime(tx);
      const type = isSwapTransaction(tx)
        ? "Swap"
        : isDeposit(tx)
          ? "Deposit"
          : isWithdraw(tx)
            ? "Withdrawal"
            : "Transaction";
      items.push({
        id: tx._id || `${type}-${date?.toISOString()}`,
        title: `${type} ${tx.trxName || ""}`.trim(),
        detail: `${tx.status || "recorded"} · ${txAmount(tx)}`,
        at: date,
      });
    });

  if (loan?.submittedAt) {
    items.push({
      id: `loan-${loan._id}`,
      title: "Loan application submitted",
      detail: loan.status || "submitted",
      at: new Date(loan.submittedAt),
    });
  }

  return items
    .filter((item) => item.at)
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8);
};

export const initials = (user) => {
  const first = String(user?.firstName || "").trim();
  const last = String(user?.lastName || "").trim();
  const letters = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
  return letters || String(user?.email || "M").charAt(0).toUpperCase();
};

export const summarizeTokens = (tokens = []) => {
  const rows = Array.isArray(tokens) ? tokens : [];
  const totalValue = rows.reduce((sum, token) => {
    const explicit = Number(token?.totalValue);
    if (Number.isFinite(explicit) && explicit > 0) return sum + explicit;
    return sum + (Number(token?.quantity) || 0) * (Number(token?.value) || 0);
  }, 0);
  return { count: rows.length, totalValue };
};

export const buildTokenAllocation = (tokens = []) =>
  (Array.isArray(tokens) ? tokens : [])
    .map((token) => {
      const explicit = Number(token?.totalValue);
      const value =
        Number.isFinite(explicit) && explicit > 0
          ? explicit
          : (Number(token?.quantity) || 0) * (Number(token?.value) || 0);
      return { name: token?.symbol || token?.name || "Token", value };
    })
    .filter((item) => item.value > 0);

export const buildStakingByAsset = (stakings = []) => {
  const totals = new Map();
  (Array.isArray(stakings) ? stakings : []).forEach((tx) => {
    const profit = Number(tx?.totalProfit);
    if (!Number.isFinite(profit) || profit <= 0) return;
    const name = tx?.trxName || "Asset";
    totals.set(name, (totals.get(name) || 0) + profit);
  });
  return Array.from(totals, ([name, value]) => ({ name, value }));
};

export const formatMoney = (value, currency = "USD") => {
  const amount = Number(value) || 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency === "EUR" ? "EUR" : "USD",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (_error) {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

export const formatDate = (value) => {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

export const formatDateTime = (value) => {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
