import { formatFiatValue, getTransactionsForCoin } from "../assets/coinConfig";
import { FIAT_CURRENCIES, convertFiatToUserCurrency } from "../../../../utils/euroCoinUtils";

export { getTransactionsForCoin };

const SWAP_FIAT_KEYS = new Set(["euro", "dollar"]);

export const isFiatSwapCoin = (coin) => Boolean(coin?.isFiat);

export const getSwapDecimals = (coin) => (isFiatSwapCoin(coin) ? 2 : 8);

export const buildFiatSwapCoins = (
  additionalCoins = [],
  transactions = [],
  getTransactionsForCoinFn = getTransactionsForCoin,
  userCurrency = "USD"
) =>
  FIAT_CURRENCIES.filter((fiat) => SWAP_FIAT_KEYS.has(fiat.key))
    .map((fiat) => {
      const coinEntry = additionalCoins.find(
        (entry) => String(entry.coinName || "").toLowerCase() === fiat.key
      );
      if (!coinEntry) return null;

      return {
        slug: fiat.key,
        name: fiat.coinName,
        symbol: fiat.label,
        trxName: fiat.key,
        logo: fiat.icon,
        balance: getTransactionsForCoinFn(fiat.key, transactions),
        price: convertFiatToUserCurrency(1, fiat.key, userCurrency),
        address: "",
        activationStatus: "active",
        isAdditional: true,
        isFiat: true,
      };
    })
    .filter(Boolean);

export const convertSwapAmount = (amount, fromCoin, toCoin) => {
  const fromPrice = Number(fromCoin?.price || 0);
  const toPrice = Number(toCoin?.price || 0);
  const value = parseFloat(amount);

  if (!Number.isFinite(value) || value <= 0 || !fromPrice || !toPrice) {
    return 0;
  }

  return (value * fromPrice) / toPrice;
};

export const getSwapRate = (fromCoin, toCoin) => {
  const fromPrice = Number(fromCoin?.price || 0);
  const toPrice = Number(toCoin?.price || 0);

  if (!fromPrice || !toPrice) return 0;
  return fromPrice / toPrice;
};

export const findSwapCoin = (coins, { symbol, trxName, slug } = {}) => {
  const normalizedSymbol = String(symbol || "").toUpperCase();
  const normalizedTrx = String(trxName || "").toLowerCase();
  const normalizedSlug = String(slug || "").toLowerCase();

  return coins.find((coin) => {
    if (normalizedSymbol && coin.symbol === normalizedSymbol) return true;
    if (normalizedTrx && coin.trxName === normalizedTrx) return true;
    if (normalizedSlug && coin.slug === normalizedSlug) return true;
    return false;
  });
};

export const pickAlternateCoin = (coins, excludedTrxName) =>
  coins.find((coin) => coin.trxName !== excludedTrxName) || coins[0] || null;

export const formatSwapAmount = (value, decimals = 8) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  return num.toFixed(decimals).replace(/\.?0+$/, "") || "0";
};

export const formatFiatEstimate = (amount, price, currency = "USD") => {
  const value = Number(amount) * Number(price || 0);
  if (!Number.isFinite(value)) {
    return formatFiatValue(0, currency);
  }
  return formatFiatValue(value, currency);
};
