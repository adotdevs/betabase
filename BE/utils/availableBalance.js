const REJECTED_STATUS_TOKENS = [
  "rejected",
  "failed",
  "cancelled",
  "canceled",
  "declined",
];

const normalizeTxStatus = (tx) => String(tx?.status || "").toLowerCase();

const isRejectedOrVoidTransaction = (tx) => {
  const status = normalizeTxStatus(tx);
  return REJECTED_STATUS_TOKENS.some((token) => status.includes(token));
};

const isCompletedTransaction = (tx) =>
  normalizeTxStatus(tx).includes("completed");

const isPendingTransaction = (tx) => normalizeTxStatus(tx).includes("pending");

const isOutgoingTransaction = (tx) => {
  const amount = Number(tx?.amount || 0);
  if (Number.isFinite(amount) && amount < 0) return true;
  return String(tx?.type || "").toLowerCase() === "withdraw";
};

const countsTowardAvailableBalance = (tx) => {
  if (!tx || isRejectedOrVoidTransaction(tx)) return false;
  if (isCompletedTransaction(tx)) return true;
  return isPendingTransaction(tx) && isOutgoingTransaction(tx);
};

const getSignedTransactionAmount = (tx) => {
  const amount = Number(tx?.amount || 0);
  if (!Number.isFinite(amount)) return 0;
  if (String(tx?.type || "").toLowerCase() === "withdraw" && amount > 0) {
    return -amount;
  }
  return amount;
};

const transactionMatchesCoin = (tx, coinSymbol) => {
  const needle = String(coinSymbol || "").toLowerCase().trim();
  if (!needle) return false;
  return String(tx?.trxName || "").toLowerCase().includes(needle);
};

const getAvailableAmountForCoin = (transactions, coinSymbol) => {
  if (!Array.isArray(transactions)) return 0;
  return transactions
    .filter(
      (tx) =>
        transactionMatchesCoin(tx, coinSymbol) &&
        countsTowardAvailableBalance(tx)
    )
    .reduce((total, tx) => total + getSignedTransactionAmount(tx), 0);
};

const assertSufficientAvailableBalance = (transactions, trxName, amount) => {
  const requested = Math.abs(Number(amount) || 0);
  if (requested <= 0) {
    return { ok: true, available: getAvailableAmountForCoin(transactions, trxName) };
  }

  const available = getAvailableAmountForCoin(transactions, trxName);
  if (requested - available > 1e-8) {
    return {
      ok: false,
      available,
      message: "Insufficient available balance",
    };
  }

  return { ok: true, available };
};

module.exports = {
  getAvailableAmountForCoin,
  assertSufficientAvailableBalance,
  countsTowardAvailableBalance,
};
