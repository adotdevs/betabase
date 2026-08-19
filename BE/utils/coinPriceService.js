const axios = require("axios");

const CMC_SYMBOLS = "BTC,ETH,BNB,XRP,DOGE,SOL,TON,LINK,DOT,NEAR,USDC,TRX";
const CMC_QUOTES_URL =
  `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${CMC_SYMBOLS}&convert=USD,EUR`;
const CMC_QUOTES_URL_USD =
  `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${CMC_SYMBOLS}&convert=USD`;

const CACHE_TTL_MS = 55_000;
const FALLBACK_USD_TO_EUR = 0.92;

const FALLBACK_USD = {
  BTC: 96075.25,
  ETH: 2640,
  BNB: 210.25,
  XRP: 0.5086,
  DOGE: 0.1163,
  SOL: 245.01,
  TON: 5.76,
  LINK: 12.52,
  DOT: 4.76,
  NEAR: 5.59,
  USDC: 0.99,
  TRX: 0.1531,
};

const PRICE_KEYS = [
  ["btcPrice", "BTC"],
  ["ethPrice", "ETH"],
  ["bnbPrice", "BNB"],
  ["xrpPrice", "XRP"],
  ["dogePrice", "DOGE"],
  ["solPrice", "SOL"],
  ["tonPrice", "TON"],
  ["linkPrice", "LINK"],
  ["dotPrice", "DOT"],
  ["nearPrice", "NEAR"],
  ["usdcPrice", "USDC"],
  ["trxPrice", "TRX"],
];

let cache = {
  prices: null,
  fetchedAt: 0,
  stale: false,
};

let inflightRequest = null;

const isPlausibleLiveRate = (rate) => {
  const n = Number(rate);
  return Number.isFinite(n) && n > 0.7 && n < 1.1 && Math.abs(n - FALLBACK_USD_TO_EUR) > 0.002;
};

const resolveUsdToEurRate = (coinData = {}) => {
  const btc = coinData.BTC;
  const usd = Number(btc?.quote?.USD?.price);
  const eur = Number(btc?.quote?.EUR?.price);
  if (usd > 0 && eur > 0) {
    const rate = eur / usd;
    if (isPlausibleLiveRate(rate)) return rate;
  }
  return null;
};

const fetchExternalUsdToEurRate = async () => {
  try {
    const { data } = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur",
      { timeout: 8000 }
    );
    const usd = Number(data?.bitcoin?.usd);
    const eur = Number(data?.bitcoin?.eur);
    if (usd > 0 && eur > 0) {
      const rate = eur / usd;
      if (isPlausibleLiveRate(rate)) return rate;
    }
  } catch (error) {
    console.warn("CoinGecko FX failed:", error.message);
  }

  try {
    const { data } = await axios.get(
      "https://api.frankfurter.app/latest?from=USD&to=EUR",
      { timeout: 8000 }
    );
    const rate = Number(data?.rates?.EUR);
    if (isPlausibleLiveRate(rate)) return rate;
  } catch (error) {
    console.warn("Frankfurter FX failed:", error.message);
  }

  return null;
};

const toQuoteObject = (usdPrice, usdToEurRate = FALLBACK_USD_TO_EUR) => {
  const usd = Number(usdPrice);
  return {
    quote: {
      USD: { price: usd },
      EUR: { price: usd * usdToEurRate },
    },
  };
};

const wrapQuote = (symbol, entry, usdToEurRate = FALLBACK_USD_TO_EUR) => {
  const liveUsd = Number(entry?.quote?.USD?.price);
  if (!Number.isFinite(liveUsd)) {
    return toQuoteObject(FALLBACK_USD[symbol], usdToEurRate);
  }

  const liveEur = Number(entry?.quote?.EUR?.price);
  if (liveUsd > 0 && isPlausibleLiveRate(liveEur / liveUsd)) {
    return entry;
  }

  return {
    ...entry,
    quote: {
      ...(entry.quote || {}),
      USD: { price: liveUsd },
      EUR: { price: liveUsd * usdToEurRate },
    },
  };
};

const buildPricePayload = (coinData = {}, usdToEurRate = FALLBACK_USD_TO_EUR) => {
  const payload = { usdToEurRate };

  PRICE_KEYS.forEach(([responseKey, symbol]) => {
    payload[responseKey] = wrapQuote(symbol, coinData[symbol], usdToEurRate);
  });

  return payload;
};

const buildFallbackPayload = (usdToEurRate = FALLBACK_USD_TO_EUR) =>
  buildPricePayload(
    Object.fromEntries(
      Object.entries(FALLBACK_USD).map(([symbol, price]) => [
        symbol,
        toQuoteObject(price, usdToEurRate),
      ])
    ),
    usdToEurRate
  );

const fetchCmc = async (url) => {
  const response = await axios.get(url, {
    headers: {
      "X-CMC_PRO_API_KEY": process.env.BTC_KEY,
    },
    timeout: 12000,
  });

  if (!response.data?.data) {
    throw new Error("Invalid CoinMarketCap response");
  }

  return response.data.data;
};

const fetchFromCoinMarketCap = async () => {
  try {
    return await fetchCmc(CMC_QUOTES_URL);
  } catch (error) {
    console.warn(
      "CoinMarketCap USD+EUR quote failed, retrying USD only:",
      error.response?.data?.status || error.message
    );
    return fetchCmc(CMC_QUOTES_URL_USD);
  }
};

const getLatestCoinPrices = async () => {
  const now = Date.now();

  if (cache.prices && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.prices;
  }

  if (inflightRequest) {
    return inflightRequest;
  }

  inflightRequest = (async () => {
    try {
      const [coinData, externalFx] = await Promise.all([
        fetchFromCoinMarketCap(),
        fetchExternalUsdToEurRate(),
      ]);

      const usdToEurRate =
        resolveUsdToEurRate(coinData) ||
        externalFx ||
        FALLBACK_USD_TO_EUR;

      const prices = buildPricePayload(coinData, usdToEurRate);

      cache = {
        prices,
        fetchedAt: Date.now(),
        stale: false,
      };

      return prices;
    } catch (error) {
      const cmcStatus = error.response?.data?.status;
      console.error("CoinMarketCap API Error:", cmcStatus || error.message);

      if (cache.prices) {
        cache.stale = true;
        cache.fetchedAt = Date.now();
        return cache.prices;
      }

      console.warn("Serving static fallback coin prices after CoinMarketCap failure");
      const externalFx = await fetchExternalUsdToEurRate().catch(() => null);
      const fallbackPrices = buildFallbackPayload(externalFx || FALLBACK_USD_TO_EUR);
      cache = {
        prices: fallbackPrices,
        fetchedAt: Date.now(),
        stale: true,
      };
      return fallbackPrices;
    } finally {
      inflightRequest = null;
    }
  })();

  return inflightRequest;
};

module.exports = {
  getLatestCoinPrices,
};
