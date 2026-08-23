import React, { useEffect, useMemo, useState } from "react";
import { getCryptoNewsApi } from "../../../Api/Service";
import styles from "./CryptoNewsTicker.module.css";

const QUOTE_TITLE_RE =
  /^(.+?)\s+\(([A-Z0-9]+)\)\s+is\s+(up|down)\s+([\d.]+)%(?:\s+in\s+24h)?(?:\s+at\s+(.+))?/i;

const coinIconUrl = (symbol = "") =>
  `https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/32/color/${symbol.toLowerCase()}.png`;

const formatPrice = (price, fallback = "") => {
  const value = Number(price);
  if (!Number.isFinite(value)) return fallback;
  const digits = value >= 1 ? 2 : 4;
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
};

const normalizeItem = (item, index) => {
  const matched = String(item?.title || "").match(QUOTE_TITLE_RE);
  const symbol = String(item?.symbol || matched?.[2] || "").toUpperCase();
  const change = Number.isFinite(Number(item?.change))
    ? Number(item.change)
    : matched
      ? matched[3].toLowerCase() === "down"
        ? -Number(matched[4])
        : Number(matched[4])
      : null;
  const isQuote = item?.kind === "quote" || Boolean(symbol && (matched || item?.price != null));

  if (isQuote) {
    return {
      kind: "quote",
      id: String(item?.id || symbol || index),
      name: item?.name || matched?.[1] || symbol,
      symbol,
      priceText: formatPrice(item?.price, matched?.[5] || ""),
      change,
      url: item?.url || "https://coinmarketcap.com/",
    };
  }

  return {
    kind: "article",
    id: String(item?.id || item?.title || index),
    title: item?.title || "",
    url: item?.url || "https://coinmarketcap.com/headlines/news/",
  };
};

const CryptoNewsTicker = () => {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const loadNews = async () => {
      try {
        const response = await getCryptoNewsApi();
        if (cancelled) return;
        if (response?.success && Array.isArray(response.news)) {
          setItems(
            response.news
              .map((item, index) => normalizeItem(item, index))
              .filter((item) => item.kind === "quote" || item.title)
          );
        }
      } catch (error) {
        console.error("Error fetching crypto news:", error);
      }
    };

    loadNews();
    const interval = setInterval(loadNews, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const loopItems = useMemo(() => {
    if (!items.length) return [];
    return items.length > 4 ? [...items, ...items] : [...items, ...items, ...items];
  }, [items]);

  if (!loopItems.length) return null;

  return (
    <div className={styles.shell}>
      <div className={styles.ticker} aria-label="Live crypto markets">
        <div className={styles.brand}>
          <span className={styles.liveDot} aria-hidden="true" />
          <span className={styles.brandText}>
            <span className={styles.brandKicker}>Live</span>
            Markets
          </span>
        </div>
        <div className={styles.trackWrap}>
          <div className={styles.track}>
            {loopItems.map((item, index) =>
              item.kind === "quote" ? (
                <a
                  key={`${item.id}-${index}`}
                  className={styles.chip}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img
                    className={styles.icon}
                    src={coinIconUrl(item.symbol)}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                  <span className={styles.symbol}>{item.symbol}</span>
                  {item.priceText ? <span className={styles.price}>{item.priceText}</span> : null}
                  {Number.isFinite(item.change) ? (
                    <span
                      className={`${styles.change} ${
                        item.change < 0 ? styles.down : styles.up
                      }`}
                    >
                      {item.change < 0 ? "▼" : "▲"} {Math.abs(item.change).toFixed(2)}%
                    </span>
                  ) : null}
                </a>
              ) : (
                <a
                  key={`${item.id}-${index}`}
                  className={styles.article}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.title}
                </a>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CryptoNewsTicker;
