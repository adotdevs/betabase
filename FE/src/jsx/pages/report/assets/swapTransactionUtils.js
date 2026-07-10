const TRX_SYMBOLS = {
  bitcoin: "BTC",
  ethereum: "ETH",
  tether: "USDT",
  bnb: "BNB",
  xrp: "XRP",
  dogecoin: "DOGE",
  solana: "SOL",
  toncoin: "TON",
  chainlink: "LINK",
  polkadot: "DOT",
  "near protocol": "NEAR",
  "usd coin": "USDC",
  tron: "TRX",
  euro: "EUR",
};

export const trxNameToSymbol = (trxName) => {
  const key = String(trxName || "").toLowerCase();
  return TRX_SYMBOLS[key] || key.toUpperCase().slice(0, 5);
};

export const isLegacySwapTransaction = (tx) =>
  Boolean(tx?.isHidden && String(tx?.txId || "") === "placeholder");

export const isSwapTransaction = (tx) => {
  if (!tx) return false;

  const txId = String(tx.txId || "");
  if (txId.startsWith("swap-")) return true;

  if (tx.note) {
    try {
      const parsed = JSON.parse(tx.note);
      if (parsed?.kind === "swap") return true;
    } catch (_) {
      // ignore invalid JSON notes
    }
  }

  return isLegacySwapTransaction(tx);
};

export const shouldShowTransaction = (tx) =>
  !tx?.isHidden || isSwapTransaction(tx);

const findLegacySwapPair = (tx, allTransactions = []) => {
  if (!tx?.createdAt) return null;

  const txTime = new Date(tx.createdAt).getTime();

  return (
    allTransactions.find((other) => {
      if (!other || String(other._id) === String(tx._id)) return false;
      if (!isLegacySwapTransaction(other)) return false;
      if (other.type === tx.type) return false;
      const delta = Math.abs(new Date(other.createdAt).getTime() - txTime);
      return delta <= 10000;
    }) || null
  );
};

export const getSwapDetails = (tx, allTransactions = []) => {
  if (!isSwapTransaction(tx)) return null;

  if (tx.note) {
    try {
      const parsed = JSON.parse(tx.note);
      if (parsed?.kind === "swap") return parsed;
    } catch (_) {
      // fall through to legacy pairing
    }
  }

  const pair = findLegacySwapPair(tx, allTransactions);
  if (!pair) {
    return { kind: "swap", legacy: true, from: null, to: null };
  }

  const sent = parseFloat(tx.amount) < 0 ? tx : pair;
  const received = parseFloat(tx.amount) > 0 ? tx : pair;

  return {
    kind: "swap",
    legacy: true,
    from: {
      trxName: sent.trxName,
      symbol: trxNameToSymbol(sent.trxName),
      amount: Math.abs(parseFloat(sent.amount || 0)),
    },
    to: {
      trxName: received.trxName,
      symbol: trxNameToSymbol(received.trxName),
      amount: Math.abs(parseFloat(received.amount || 0)),
    },
  };
};

export const formatSwapPairLabel = (details) => {
  if (!details?.from || !details?.to) return "Swap";
  return `${details.from.symbol} → ${details.to.symbol}`;
};

export const formatSwapAmountLabel = (value, symbol) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return `0 ${symbol || ""}`.trim();
  const formatted = num.toFixed(8).replace(/\.?0+$/, "") || "0";
  return `${formatted} ${symbol || ""}`.trim();
};

export const buildSwapNote = ({ swapId, fromCoin, toCoin, fromAmount, toAmount }) =>
  JSON.stringify({
    kind: "swap",
    swapId,
    from: {
      trxName: fromCoin.trxName,
      symbol: fromCoin.symbol,
      amount: fromAmount,
    },
    to: {
      trxName: toCoin.trxName,
      symbol: toCoin.symbol,
      amount: toAmount,
    },
  });

export const getSwapListSubtitle = (tx, allTransactions = []) => {
  const details = getSwapDetails(tx, allTransactions);
  if (!details?.from || !details?.to) return "Asset swap";

  const amount = parseFloat(tx.amount || 0);
  if (amount < 0) {
    return `Sent ${formatSwapAmountLabel(details.from.amount, details.from.symbol)} · Received ${formatSwapAmountLabel(details.to.amount, details.to.symbol)}`;
  }
  return `Received ${formatSwapAmountLabel(details.to.amount, details.to.symbol)} · Sent ${formatSwapAmountLabel(details.from.amount, details.from.symbol)}`;
};
