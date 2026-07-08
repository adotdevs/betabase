/** USD ↔ EUR rates used elsewhere in the app for crypto conversion */
export const USD_TO_EUR_RATE = 0.92;
export const EUR_TO_USD_RATE = 1 / USD_TO_EUR_RATE;

export const isEuroCoin = (name) => {
  const normalized = String(name || "").toLowerCase().trim();
  return normalized === "euro" || normalized === "eur";
};

/** Sum completed (or pending) euro coin transaction amounts — 1 unit = 1 EUR */
export const sumEuroCoinAmount = (transactions, status = "completed") => {
  if (!Array.isArray(transactions)) return 0;

  return transactions
    .filter((transaction) => isEuroCoin(transaction.trxName))
    .filter((transaction) => String(transaction.status || "").includes(status))
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
};

/**
 * Merge crypto (USD-denominated) totals with euro coin (1:1 EUR).
 * @param {number} cryptoUsdTotal - sum of non-euro balances already priced in USD
 * @param {number} euroAmount - raw euro coin units
 * @param {string} userCurrency - "EUR" | "USD"
 */
export const combinePortfolioTotal = (cryptoUsdTotal, euroAmount, userCurrency = "USD") => {
  const cryptoTotal = Number(cryptoUsdTotal) || 0;
  const euroTotal = Number(euroAmount) || 0;

  if (String(userCurrency).toUpperCase() === "EUR") {
    return cryptoTotal * USD_TO_EUR_RATE + euroTotal;
  }

  return cryptoTotal + euroTotal * EUR_TO_USD_RATE;
};

/** Fiat display value for euro coin rows — always EUR, never treated as USD */
export const formatEuroCoinFiat = (amount, { decimals = 2 } = {}) => {
  const value = Math.abs(Number(amount) || 0);
  return `${value.toFixed(decimals)} EUR`;
};

/** Symbol + formatted amount for euro coin transactions */
export const formatEuroCoinTransaction = (amount, type = "deposit") => {
  const value = Math.abs(Number(amount) || 0).toFixed(2);
  const prefix = type === "withdraw" ? "-" : "+";
  return `${prefix}€${value}`;
};

/** Convert a non-euro crypto amount to the user's display currency */
export const convertCryptoToUserCurrency = (amount, rate, userCurrency = "USD") => {
  const value = Math.abs(Number(amount) || 0) * (Number(rate) || 0);

  if (String(userCurrency).toUpperCase() === "EUR") {
    return (value * USD_TO_EUR_RATE).toFixed(2);
  }

  return value.toFixed(2);
};

/** Display symbol for a transaction row */
export const getTransactionCurrencySymbol = (trxName, userCurrency = "USD") => {
  if (isEuroCoin(trxName)) return "€";
  return String(userCurrency).toUpperCase() === "EUR" ? "€" : "$";
};
