const axios = require("axios");

const CMC_QUOTES_URL =
  "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=BTC,ETH,BNB,XRP,DOGE,SOL,TON,LINK,DOT,NEAR,USDC,TRX&convert=USD";

const CACHE_TTL_MS = 55_000;

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

const toQuoteObject = (price) => ({
  quote: {
    USD: {
      price: Number(price),
    },
  },
});

const wrapQuote = (symbol, entry) => {
  const livePrice = entry?.quote?.USD?.price;
  if (Number.isFinite(Number(livePrice))) {
    return entry;
  }

  return toQuoteObject(FALLBACK_USD[symbol]);
};

const buildPricePayload = (coinData = {}) => {
  const payload = {};

  PRICE_KEYS.forEach(([responseKey, symbol]) => {
    payload[responseKey] = wrapQuote(symbol, coinData[symbol]);
  });

  return payload;
};

const buildFallbackPayload = () => buildPricePayload(
  Object.fromEntries(
    Object.entries(FALLBACK_USD).map(([symbol, price]) => [symbol, toQuoteObject(price)])
  )
);

const fetchFromCoinMarketCap = async () => {
  const response = await axios.get(CMC_QUOTES_URL, {
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
      const coinData = await fetchFromCoinMarketCap();
      const prices = buildPricePayload(coinData);

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
      const fallbackPrices = buildFallbackPayload();
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
