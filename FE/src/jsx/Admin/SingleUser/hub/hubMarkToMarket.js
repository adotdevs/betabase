import axios from "axios";
import { COINGECKO_IDS, getCoinGeckoId, slugFromTrxName } from "../../../pages/report/assets/coinConfig";
import {
  convertFiatToUserCurrency,
  countsTowardAvailableBalance,
  getSignedTransactionAmount,
  isFiatCoin,
} from "../../../../utils/euroCoinUtils";
import { periodDays, rangeForPeriod, txTime } from "./hubData";

const CACHE_TTL_MS = 15 * 60 * 1000;
const STABLE_COINS = new Set(["tether", "usd coin", "usd-coin", "usdc", "usdt"]);
const priceCache = new Map();
const priceInflight = new Map();

export const toDayKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const geckoIdForTrx = (trxName) => {
  const raw = String(trxName || "").toLowerCase().trim();
  if (!raw) return "";
  const slug = slugFromTrxName(raw);
  return COINGECKO_IDS[raw] || COINGECKO_IDS[slug] || getCoinGeckoId(raw) || getCoinGeckoId(slug) || "";
};

const isStable = (trxName) => STABLE_COINS.has(String(trxName || "").toLowerCase().trim());

const listDays = (period) => {
  const { start, end } = rangeForPeriod(period);
  const days = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cursor <= last) {
    days.push(toDayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
};

export const replayDailyHoldings = (transactions = [], period = "30d") => {
  const days = listDays(period);
  if (!days.length) return [];

  const start = days[0];
  const running = new Map();
  const byDay = new Map();

  (Array.isArray(transactions) ? transactions : []).forEach((tx) => {
    if (!countsTowardAvailableBalance(tx)) return;
    const delta = getSignedTransactionAmount(tx);
    if (!delta) return;
    const coin = String(tx?.trxName || "").toLowerCase().trim();
    if (!coin) return;
    const time = txTime(tx);
    if (!time) return;
    const key = toDayKey(time);
    if (!key) return;
    if (key < start) {
      running.set(coin, (running.get(coin) || 0) + delta);
      return;
    }
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push({ coin, delta });
  });

  return days.map((day) => {
    (byDay.get(day) || []).forEach(({ coin, delta }) => {
      running.set(coin, (running.get(coin) || 0) + delta);
    });
    return { date: day, balances: Object.fromEntries(running) };
  });
};

export const needsMarketHistory = (coins = []) =>
  coins.some((coin) => !isFiatCoin(coin));

export const hasUsableHistory = (priceMaps = {}) =>
  Object.values(priceMaps).some((map) => map && Object.keys(map).length > 0);

export const coinsHeldInSeries = (dailyHoldings = []) => {
  const held = new Set();
  dailyHoldings.forEach((row) => {
    Object.entries(row.balances || {}).forEach(([coin, amount]) => {
      if (Math.abs(Number(amount) || 0) > 1e-12) held.add(coin);
    });
  });
  return Array.from(held);
};

const toDailyMap = (points = []) => {
  const map = {};
  points.forEach((point) => {
    const stamp = Array.isArray(point) ? point[0] : point?.timestamp;
    const price = Array.isArray(point) ? point[1] : point?.price;
    const key = toDayKey(stamp);
    const value = Number(price);
    if (!key || !Number.isFinite(value) || value <= 0) return;
    map[key] = value;
  });
  return map;
};

const readCache = (key) => {
  const hit = priceCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) return null;
  return hit.map;
};

const fetchCoinDailyPrices = (geckoId, days, vsCurrency) => {
  const key = `${geckoId}:${vsCurrency}:${days}`;
  const cached = readCache(key);
  if (cached) return Promise.resolve(cached);
  if (priceInflight.has(key)) return priceInflight.get(key);

  const job = axios
    .get(`https://api.coingecko.com/api/v3/coins/${geckoId}/market_chart`, {
      params: { vs_currency: vsCurrency, days },
      timeout: 15000,
    })
    .then((response) => {
      const map = toDailyMap(response.data?.prices || []);
      priceCache.set(key, { at: Date.now(), map });
      priceInflight.delete(key);
      return map;
    })
    .catch(() => {
      priceInflight.delete(key);
      const stale = priceCache.get(key)?.map || {};
      return stale;
    });

  priceInflight.set(key, job);
  return job;
};

export const loadDailyPriceMaps = async (coins = [], period = "30d", currency = "USD") => {
  const vsCurrency = currency === "EUR" ? "eur" : "usd";
  const days = periodDays(period);
  const maps = {};

  await Promise.all(
    coins.map(async (coin) => {
      if (isFiatCoin(coin)) return;
      const geckoId = geckoIdForTrx(coin);
      if (!geckoId) return;
      maps[coin] = await fetchCoinDailyPrices(geckoId, days, vsCurrency);
    })
  );

  return maps;
};

const lookupPrice = (coin, day, priceMaps, livePrices, currency) => {
  if (isFiatCoin(coin)) {
    return Number(convertFiatToUserCurrency(1, coin, currency)) || 0;
  }

  const history = priceMaps[coin] || {};
  if (Number.isFinite(history[day]) && history[day] > 0) return history[day];

  const keys = Object.keys(history).sort();
  for (let index = keys.length - 1; index >= 0; index -= 1) {
    if (keys[index] <= day && history[keys[index]] > 0) return history[keys[index]];
  }

  const live = Number(livePrices?.[coin]);
  if (Number.isFinite(live) && live > 0) return live;
  return isStable(coin) ? 1 : 0;
};

const formatLabel = (day) => {
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export const buildMarkToMarketSeries = ({
  dailyHoldings = [],
  priceMaps = {},
  livePrices = {},
  currency = "USD",
} = {}) => {
  const points = dailyHoldings.map((row) => {
    let value = 0;
    Object.entries(row.balances || {}).forEach(([coin, amount]) => {
      const qty = Number(amount) || 0;
      if (Math.abs(qty) < 1e-12) return;
      value += qty * lookupPrice(coin, row.date, priceMaps, livePrices, currency);
    });
    return {
      date: formatLabel(row.date),
      day: row.date,
      value: Number(value.toFixed(2)),
    };
  });

  const valued = points.filter((point) => Number.isFinite(point.value));
  const first = valued.find((point) => point.value > 0);
  const last = [...valued].reverse().find((point) => Number.isFinite(point.value));
  const changePct =
    first && last && first.value > 0 ? ((last.value - first.value) / first.value) * 100 : null;

  return {
    points: valued,
    hasData: valued.some((point) => point.value > 0),
    changePct,
    lastValue: last?.value ?? 0,
  };
};
