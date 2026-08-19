import { useEffect, useState } from "react";
import EurIco from "../assets/images/new/euro.svg";
import DollarIco from "../assets/images/new/dollar.svg";
import ChfIco from "../assets/images/new/chf.svg";
import DkkIco from "../assets/images/new/dkk.svg";

const FALLBACK_USD_TO_EUR = 0.92;
let liveUsdToEurRate = FALLBACK_USD_TO_EUR;
const fxListeners = new Set();
let fxInflight = null;
let fxFetchedAt = 0;
const FX_TTL_MS = 60_000;

const isPlausibleLiveRate = (rate) => {
  const n = Number(rate);
  return Number.isFinite(n) && n > 0.7 && n < 1.1 && Math.abs(n - FALLBACK_USD_TO_EUR) > 0.002;
};

const notifyFxListeners = () => {
  fxListeners.forEach((listener) => listener(liveUsdToEurRate));
};

export const getUsdToEurRate = () => liveUsdToEurRate;
export const getEurToUsdRate = () => 1 / liveUsdToEurRate;

export const setUsdToEurRate = (rate) => {
  const next = Number(rate);
  if (!isPlausibleLiveRate(next) && Math.abs(next - FALLBACK_USD_TO_EUR) > 0.0001) {
    return;
  }
  if (!isPlausibleLiveRate(next)) return;
  if (Math.abs(next - liveUsdToEurRate) < 0.00001) return;
  liveUsdToEurRate = next;
  notifyFxListeners();
};

export const subscribeUsdToEurRate = (listener) => {
  fxListeners.add(listener);
  listener(liveUsdToEurRate);
  return () => fxListeners.delete(listener);
};

export const useUsdToEurRate = () => {
  const [rate, setRate] = useState(liveUsdToEurRate);
  useEffect(() => subscribeUsdToEurRate(setRate), []);
  useEffect(() => {
    refreshLiveUsdToEurRate();
  }, []);
  return rate;
};

export const refreshLiveUsdToEurRate = async () => {
  if (fxInflight) return fxInflight;
  if (Date.now() - fxFetchedAt < FX_TTL_MS && isPlausibleLiveRate(liveUsdToEurRate)) {
    return liveUsdToEurRate;
  }

  fxInflight = (async () => {
    try {
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur"
      );
      const data = await response.json();
      const usd = Number(data?.bitcoin?.usd);
      const eur = Number(data?.bitcoin?.eur);
      if (usd > 0 && eur > 0) {
        setUsdToEurRate(eur / usd);
        fxFetchedAt = Date.now();
        return liveUsdToEurRate;
      }
    } catch (_) {
      // try ECB next
    }

    try {
      const response = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR");
      const data = await response.json();
      const rate = Number(data?.rates?.EUR);
      if (isPlausibleLiveRate(rate)) {
        setUsdToEurRate(rate);
        fxFetchedAt = Date.now();
        return liveUsdToEurRate;
      }
    } catch (_) {
      // keep current rate
    }

    return liveUsdToEurRate;
  })().finally(() => {
    fxInflight = null;
  });

  return fxInflight;
};

/** Apply live USD→EUR from CoinMarketCap payload (`usdToEurRate` or BTC quotes). */
export const applyLiveFxFromPricePayload = (payload) => {
  if (!payload || typeof payload !== "object") return;

  const usd = Number(payload.btcPrice?.quote?.USD?.price);
  const eur = Number(payload.btcPrice?.quote?.EUR?.price);
  if (usd > 0 && eur > 0) {
    setUsdToEurRate(eur / usd);
  }

  const direct = Number(payload.usdToEurRate);
  if (isPlausibleLiveRate(direct)) {
    setUsdToEurRate(direct);
  }

  refreshLiveUsdToEurRate();
};

/** @deprecated use getUsdToEurRate() — kept as the fallback constant */
export const USD_TO_EUR_RATE = FALLBACK_USD_TO_EUR;
export const EUR_TO_USD_RATE = 1 / FALLBACK_USD_TO_EUR;
/** Approximate fiat ↔ USD for portfolio totals (1 unit → USD) */
export const CHF_TO_USD_RATE = 1.12;
export const USD_TO_CHF_RATE = 1 / CHF_TO_USD_RATE;
export const DKK_TO_USD_RATE = 0.145;
export const USD_TO_DKK_RATE = 1 / DKK_TO_USD_RATE;

export const FIAT_CURRENCIES = [
  {
    key: "euro",
    amountKey: "euro",
    coinName: "Euro",
    coinSymbol: "eur",
    label: "EUR",
    symbol: "€",
    icon: EurIco,
    usdRate: EUR_TO_USD_RATE,
    bankAccountField: "euroBankAccount",
    adminPath: "euro-account",
    adminTitle: "Euro Account",
  },
  {
    key: "dollar",
    amountKey: "dollar",
    coinName: "Dollar",
    coinSymbol: "usd",
    label: "USD",
    symbol: "$",
    icon: DollarIco,
    usdRate: 1,
    bankAccountField: "usdBankAccount",
    adminPath: "usd-account",
    adminTitle: "Dollar Account",
  },
  {
    key: "swiss franc",
    amountKey: "chf",
    coinName: "Swiss Franc",
    coinSymbol: "chf",
    label: "CHF",
    symbol: "CHF",
    icon: ChfIco,
    usdRate: CHF_TO_USD_RATE,
    bankAccountField: "chfBankAccount",
    adminPath: "chf-account",
    adminTitle: "Swiss Franc Account",
  },
  {
    key: "danish krone",
    amountKey: "dkk",
    coinName: "Danish Krone",
    coinSymbol: "dkk",
    label: "DKK",
    symbol: "kr",
    icon: DkkIco,
    usdRate: DKK_TO_USD_RATE,
    bankAccountField: "dkkBankAccount",
    adminPath: "dkk-account",
    adminTitle: "Danish Krone Account",
  },
];

const normalizeFiatName = (name) => String(name || "").toLowerCase().trim();

export const getFiatCurrencyByKey = (key) =>
  FIAT_CURRENCIES.find((fiat) => fiat.key === normalizeFiatName(key));

export const getFiatCurrencyByName = (name) => {
  const normalized = normalizeFiatName(name);
  return FIAT_CURRENCIES.find(
    (fiat) =>
      fiat.key === normalized ||
      fiat.coinName.toLowerCase() === normalized ||
      fiat.coinSymbol === normalized ||
      fiat.amountKey === normalized
  );
};

export const isEuroCoin = (name) => {
  const normalized = normalizeFiatName(name);
  return normalized === "euro" || normalized === "eur";
};

export const isUsdFiatCoin = (name) => {
  const normalized = normalizeFiatName(name);
  return normalized === "dollar" || normalized === "usd";
};

export const isChfFiatCoin = (name) => {
  const normalized = normalizeFiatName(name);
  return normalized === "swiss franc" || normalized === "chf" || normalized === "franc";
};

export const isDkkFiatCoin = (name) => {
  const normalized = normalizeFiatName(name);
  return normalized === "danish krone" || normalized === "dkk" || normalized === "krone";
};

export const isFiatCoin = (name) => Boolean(getFiatCurrencyByName(name));

export const getFiatUsdRate = (fiatOrKey) => {
  const fiat =
    typeof fiatOrKey === "string"
      ? getFiatCurrencyByKey(fiatOrKey) || getFiatCurrencyByName(fiatOrKey)
      : fiatOrKey;
  if (!fiat) return 1;
  if (fiat.key === "euro") return getEurToUsdRate();
  return fiat.usdRate;
};

/** Fiat coins tracked as additionalCoins but hidden from user crypto portfolio */
export const isFiatCoinHiddenFromCrypto = (coinName) => isFiatCoin(coinName);

export const isFiatTrxNameForAdmin = (trxName) => {
  const fiat = getFiatCurrencyByName(trxName);
  return fiat ? fiat.coinName : null;
};

export const sumFiatCoinAmount = (transactions, fiatKey, status = "completed") => {
  if (!Array.isArray(transactions)) return 0;

  const fiat = getFiatCurrencyByKey(fiatKey);
  if (!fiat) return 0;

  return transactions
    .filter((transaction) => getFiatCurrencyByName(transaction.trxName)?.key === fiat.key)
    .filter((transaction) => String(transaction.status || "").includes(status))
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
};

/** Build { euro, dollar, chf, dkk } amounts from wallet transactions */
export const buildFiatAmountsFromTransactions = (transactions, status = "completed") =>
  FIAT_CURRENCIES.reduce((amounts, fiat) => {
    amounts[fiat.amountKey] = sumFiatCoinAmount(transactions, fiat.key, status);
    return amounts;
  }, {});

export const sumFiatAmountsToUsd = (fiatAmounts = {}) =>
  FIAT_CURRENCIES.reduce((total, fiat) => {
    const amount = Number(fiatAmounts[fiat.amountKey] ?? 0) || 0;
    return total + amount * getFiatUsdRate(fiat);
  }, 0);

/** @deprecated use sumFiatCoinAmount(transactions, 'euro', status) */
export const sumEuroCoinAmount = (transactions, status = "completed") =>
  sumFiatCoinAmount(transactions, "euro", status);

export const sumUsdFiatCoinAmount = (transactions, status = "completed") =>
  sumFiatCoinAmount(transactions, "dollar", status);

export const sumChfFiatCoinAmount = (transactions, status = "completed") =>
  sumFiatCoinAmount(transactions, "swiss franc", status);

export const sumDkkFiatCoinAmount = (transactions, status = "completed") =>
  sumFiatCoinAmount(transactions, "danish krone", status);

/**
 * Merge crypto (USD-denominated) totals with fiat coin balances.
 * @param {number} cryptoUsdTotal - sum of non-fiat balances already priced in USD
 * @param {object|number} fiatAmountsOrEuro - fiat amount map or legacy euro-only number
 * @param {string} userCurrency - "EUR" | "USD"
 */
export const combinePortfolioTotal = (
  cryptoUsdTotal,
  fiatAmountsOrEuro = {},
  userCurrency = "USD"
) => {
  const cryptoTotal = Number(cryptoUsdTotal) || 0;
  let fiatUsdTotal = 0;
  let displayCurrency = userCurrency;

  if (
    typeof fiatAmountsOrEuro === "number" ||
    typeof fiatAmountsOrEuro === "string"
  ) {
    fiatUsdTotal = (Number(fiatAmountsOrEuro) || 0) * getEurToUsdRate();
    displayCurrency = userCurrency;
  } else {
    fiatUsdTotal = sumFiatAmountsToUsd(fiatAmountsOrEuro);
    displayCurrency = fiatAmountsOrEuro.userCurrency || userCurrency;
  }

  if (String(displayCurrency).toUpperCase() === "EUR") {
    return cryptoTotal * getUsdToEurRate() + fiatUsdTotal * getUsdToEurRate();
  }

  return cryptoTotal + fiatUsdTotal;
};

/** Fiat display value — never treated as crypto USD price */
export const formatFiatCoinFiat = (amount, label = "EUR", { decimals = 2 } = {}) => {
  const value = Math.abs(Number(amount) || 0);
  return `${value.toFixed(decimals)} ${label}`;
};

/** @deprecated use formatFiatCoinFiat(amount, 'EUR') */
export const formatEuroCoinFiat = (amount, options) =>
  formatFiatCoinFiat(amount, "EUR", options);

export const formatFiatCoinTransaction = (amount, type = "deposit", symbol = "€") => {
  const value = Math.abs(Number(amount) || 0).toFixed(2);
  const prefix = type === "withdraw" ? "-" : "+";
  return `${prefix}${symbol}${value}`;
};

/** @deprecated */
export const formatEuroCoinTransaction = (amount, type = "deposit") =>
  formatFiatCoinTransaction(amount, type, "€");

/** Convert a non-fiat crypto amount to the user's display currency */
export const convertCryptoToUserCurrency = (amount, rate, userCurrency = "USD") => {
  const value = Math.abs(Number(amount) || 0) * (Number(rate) || 0);

  if (String(userCurrency).toUpperCase() === "EUR") {
    return (value * getUsdToEurRate()).toFixed(2);
  }

  return value.toFixed(2);
};

export const getUserDisplayCurrency = (userCurrency = "USD") =>
  String(userCurrency || "USD").toUpperCase() === "EUR" ? "EUR" : "USD";

/** Convert a USD amount into the user's display currency */
export const convertUsdToUserCurrencyAmount = (usdAmount, userCurrency = "USD") => {
  const value = Number(usdAmount) || 0;
  if (getUserDisplayCurrency(userCurrency) === "EUR") {
    return value * getUsdToEurRate();
  }
  return value;
};

export const getUserDisplaySymbol = (userCurrency = "USD") =>
  getUserDisplayCurrency(userCurrency) === "EUR" ? "€" : "$";

export const isFiatNativeMatchingUserCurrency = (fiatKeyOrName, userCurrency = "USD") => {
  const fiat = getFiatCurrencyByKey(fiatKeyOrName) || getFiatCurrencyByName(fiatKeyOrName);
  const display = getUserDisplayCurrency(userCurrency);
  if (!fiat) return false;
  if (fiat.key === "euro" && display === "EUR") return true;
  if (fiat.key === "dollar" && display === "USD") return true;
  return false;
};

/** Convert native fiat amount to USD equivalent */
export const fiatAmountToUsd = (amount, fiatKeyOrName) => {
  const fiat = getFiatCurrencyByKey(fiatKeyOrName) || getFiatCurrencyByName(fiatKeyOrName);
  const nativeAmount = Math.abs(Number(amount) || 0);
  if (!fiat) return nativeAmount;
  return nativeAmount * getFiatUsdRate(fiat);
};

/** Convert native fiat amount to the user's display currency (EUR or USD) */
export const convertFiatToUserCurrency = (amount, fiatKeyOrName, userCurrency = "USD") => {
  const usdValue = fiatAmountToUsd(amount, fiatKeyOrName);
  return convertUsdToUserCurrencyAmount(usdValue, userCurrency);
};

/** Fiat balance with native label plus EUR/USD equivalent when different */
export const formatFiatBalanceForUser = (amount, fiatKeyOrName, userCurrency = "USD") => {
  const fiat = getFiatCurrencyByKey(fiatKeyOrName) || getFiatCurrencyByName(fiatKeyOrName);
  if (!fiat) return `${Math.abs(Number(amount) || 0).toFixed(2)}`;

  const native = `${Math.abs(Number(amount) || 0).toFixed(2)} ${fiat.label}`;
  if (isFiatNativeMatchingUserCurrency(fiat.key, userCurrency)) {
    return native;
  }

  const display = getUserDisplayCurrency(userCurrency);
  const converted = convertFiatToUserCurrency(amount, fiat.key, userCurrency);
  return `${native} (${converted.toFixed(2)} ${display})`;
};

/** Admin / wallet row: native fiat plus client EUR/USD equivalent */
export const formatFiatBalanceForAdmin = (amount, fiatKeyOrName, userCurrency = "USD") =>
  formatFiatBalanceForUser(amount, fiatKeyOrName, userCurrency);

/** Converted fiat amount for transaction lists (uses user currency symbol) */
export const getFiatTransactionDisplayAmount = (amount, trxName, userCurrency = "USD") => {
  const fiat = getFiatCurrencyByName(trxName);
  if (!fiat) {
    return Math.abs(Number(amount) || 0).toFixed(2);
  }

  if (isFiatNativeMatchingUserCurrency(fiat.key, userCurrency)) {
    return Math.abs(Number(amount) || 0).toFixed(2);
  }

  return convertFiatToUserCurrency(amount, fiat.key, userCurrency).toFixed(2);
};

/** Display symbol for a transaction row */
export const getTransactionCurrencySymbol = (trxName, userCurrency = "USD") => {
  const fiat = getFiatCurrencyByName(trxName);
  if (fiat) {
    if (isFiatNativeMatchingUserCurrency(fiat.key, userCurrency)) {
      return fiat.symbol;
    }
    return getUserDisplaySymbol(userCurrency);
  }
  return getUserDisplaySymbol(userCurrency);
};

/** USD equivalent shown in admin transaction lists */
export const getFiatUsdEquivalent = (amount, trxName) =>
  fiatAmountToUsd(amount, trxName).toFixed(2);

export const getFiatBalanceFromCoins = (fiatKey, additionalCoins, transactions, getTransactionsForCoin) => {
  const fiat = getFiatCurrencyByKey(fiatKey);
  if (!fiat || !additionalCoins?.length || !transactions) return 0;

  const coin = additionalCoins.find(
    (entry) => normalizeFiatName(entry.coinName) === fiat.key
  );
  if (!coin) return 0;

  return getTransactionsForCoin(fiat.key, transactions);
};
