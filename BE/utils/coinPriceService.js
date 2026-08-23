const axios = require("axios");

const CMC_SYMBOLS = "BTC,ETH,USDT,BNB,XRP,DOGE,SOL,TON,LINK,DOT,NEAR,USDC,TRX";
const CACHE_TTL_MS = 30_000;
const FALLBACK_USD_TO_EUR = 0.92;

const FALLBACK_USD = {
  BTC: 96075.25,
  ETH: 2640,
  USDT: 1,
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
  ["usdtPrice", "USDT"],
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
let lastLiveUsdToEurRate = FALLBACK_USD_TO_EUR;

const cmcQuotesUrl = (convert) =>
  `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${CMC_SYMBOLS}&convert=${convert}`;

const isFinitePositive = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
};

const isValidFxRate = (rate) => {
  const n = Number(rate);
  return Number.isFinite(n) && n > 0.7 && n < 1.1;
};

const quoteUsd = (entry) => Number(entry?.quote?.USD?.price);
const quoteEur = (entry) => Number(entry?.quote?.EUR?.price);
const normalizeCmcEntry = (entry) => (Array.isArray(entry) ? entry[0] : entry);

const resolveUsdToEurRate = (coinData = {}) => {
  const btc = normalizeCmcEntry(coinData.BTC);
  const usd = quoteUsd(btc);
  const eur = quoteEur(btc);
  if (usd > 0 && eur > 0) {
    const rate = eur / usd;
    if (isValidFxRate(rate)) return rate;
  }
  return null;
};

const toQuoteObject = (usdPrice, usdToEurRate = lastLiveUsdToEurRate) => {
  const usd = Number(usdPrice) || 0;
  return {
    quote: {
      USD: { price: usd },
      EUR: { price: usd * usdToEurRate },
    },
  };
};

const wrapQuote = (symbol, entry, usdToEurRate = lastLiveUsdToEurRate) => {
  const liveEntry = normalizeCmcEntry(entry);
  const liveUsd = quoteUsd(liveEntry);
  const liveEur = quoteEur(liveEntry);

  if (!Number.isFinite(liveUsd)) {
    return toQuoteObject(FALLBACK_USD[symbol], usdToEurRate);
  }

  if (isFinitePositive(liveEur)) {
    return {
      ...liveEntry,
      quote: {
        ...(liveEntry.quote || {}),
        USD: { price: liveUsd },
        EUR: { price: liveEur },
      },
    };
  }

  return {
    ...liveEntry,
    quote: {
      ...(liveEntry.quote || {}),
      USD: { price: liveUsd },
      EUR: { price: liveUsd * usdToEurRate },
    },
  };
};

const buildPricePayload = (coinData = {}, usdToEurRate = lastLiveUsdToEurRate) => {
  const payload = { usdToEurRate };

  PRICE_KEYS.forEach(([responseKey, symbol]) => {
    payload[responseKey] = wrapQuote(symbol, coinData[symbol], usdToEurRate);
  });

  return payload;
};

const buildFallbackPayload = (usdToEurRate = lastLiveUsdToEurRate) =>
  buildPricePayload(
    Object.fromEntries(
      Object.entries(FALLBACK_USD).map(([symbol, price]) => [
        symbol,
        toQuoteObject(price, usdToEurRate),
      ])
    ),
    usdToEurRate
  );

const fetchCmc = async (convert) => {
  const response = await axios.get(cmcQuotesUrl(convert), {
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

const mergeUsdAndEurQuotes = (usdData = {}, eurData = {}) => {
  const merged = {};
  const symbols = new Set([...Object.keys(usdData), ...Object.keys(eurData)]);

  symbols.forEach((symbol) => {
    const usdEntry = usdData[symbol] || {};
    const eurEntry = eurData[symbol] || {};
    merged[symbol] = {
      ...usdEntry,
      ...eurEntry,
      quote: {
        ...(usdEntry.quote || {}),
        ...(eurEntry.quote || {}),
        USD: usdEntry.quote?.USD,
        EUR: eurEntry.quote?.EUR || usdEntry.quote?.EUR,
      },
    };
  });

  return merged;
};

const fetchFromCoinMarketCap = async () => {
  // Basic CMC plans only allow one `convert` currency per request.
  const [usdData, eurResult] = await Promise.allSettled([
    fetchCmc("USD"),
    fetchCmc("EUR"),
  ]);

  if (usdData.status !== "fulfilled") {
    throw usdData.reason;
  }

  if (eurResult.status !== "fulfilled") {
    console.warn(
      "CoinMarketCap EUR quote failed:",
      eurResult.reason?.response?.data?.status || eurResult.reason?.message
    );
  }

  const eurData = eurResult.status === "fulfilled" ? eurResult.value : {};
  return mergeUsdAndEurQuotes(usdData.value, eurData);
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
      const usdToEurRate =
        resolveUsdToEurRate(coinData) || lastLiveUsdToEurRate || FALLBACK_USD_TO_EUR;

      if (isValidFxRate(usdToEurRate)) {
        lastLiveUsdToEurRate = usdToEurRate;
      }

      const prices = buildPricePayload(coinData, lastLiveUsdToEurRate);

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
      const fallbackPrices = buildFallbackPayload(lastLiveUsdToEurRate);
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

const NEWS_CACHE_TTL_MS = 10 * 60 * 1000;
let newsCache = {
  items: null,
  fetchedAt: 0,
  source: null,
};

const normalizeNewsItem = (item, index = 0) => {
  const title = String(item?.title || item?.subtitle || item?.meta?.title || "").trim();
  if (!title) return null;

  return {
    id: String(item?.id || item?.slug || item?.source_url || title || index),
    kind: "article",
    title,
    source: String(item?.source_name || item?.source || item?.meta?.source_name || "CoinMarketCap"),
    url: String(
      item?.source_url ||
        item?.url ||
        item?.meta?.source_url ||
        "https://coinmarketcap.com/headlines/news/"
    ),
    publishedAt: item?.released_at || item?.published_at || item?.createdAt || null,
  };
};

const fetchCmcContentNews = async () => {
  const endpoints = [
    "https://pro-api.coinmarketcap.com/v1/content/latest",
    "https://pro-api.coinmarketcap.com/v1/content/posts/latest",
  ];

  let lastError = null;
  for (const url of endpoints) {
    try {
      const response = await axios.get(url, {
        headers: {
          "X-CMC_PRO_API_KEY": process.env.BTC_KEY,
        },
        params: { limit: 20 },
        timeout: 12000,
      });

      const rows = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
          ? response.data
          : [];
      const items = rows.map(normalizeNewsItem).filter(Boolean);
      if (items.length) return items;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("CoinMarketCap content news unavailable");
};

const fetchCmcMarketHeadlines = async () => {
  const usdData = await fetchCmc("USD");

  return Object.values(usdData)
    .map((entry) => normalizeCmcEntry(entry))
    .filter((coin) => coin?.name && coin?.symbol)
    .map((coin) => {
      const change = Number(coin.quote?.USD?.percent_change_24h);
      const price = Number(coin.quote?.USD?.price);
      const direction = Number.isFinite(change) && change < 0 ? "down" : "up";
      const changeText = Number.isFinite(change)
        ? `${Math.abs(change).toFixed(2)}%`
        : "—";
      const priceText = Number.isFinite(price)
        ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
        : "";

      return {
        id: String(coin.symbol),
        kind: "quote",
        name: coin.name,
        symbol: String(coin.symbol).toUpperCase(),
        title: `${coin.name} (${coin.symbol}) is ${direction} ${changeText} in 24h${priceText ? ` at ${priceText}` : ""}`,
        source: "CoinMarketCap",
        url: coin.slug
          ? `https://coinmarketcap.com/currencies/${coin.slug}/`
          : "https://coinmarketcap.com/",
        price: Number.isFinite(price) ? price : null,
        change: Number.isFinite(change) ? change : 0,
        direction,
      };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
};

const getCryptoNews = async () => {
  const now = Date.now();
  if (newsCache.items?.length && now - newsCache.fetchedAt < NEWS_CACHE_TTL_MS) {
    return newsCache;
  }

  try {
    const items = await fetchCmcContentNews();
    newsCache = { items, fetchedAt: now, source: "content" };
    return newsCache;
  } catch (error) {
    const cmcStatus = error.response?.data?.status;
    console.warn(
      "CoinMarketCap news content unavailable, using market headlines:",
      cmcStatus || error.message
    );

    const items = await fetchCmcMarketHeadlines();
    newsCache = { items, fetchedAt: Date.now(), source: "quotes" };
    return newsCache;
  }
};

module.exports = {
  getLatestCoinPrices,
  getCryptoNews,
};
