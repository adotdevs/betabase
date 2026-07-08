import React, { useEffect, useRef } from "react";
import styles from "./CoinMarketCapChart.module.css";

const CoinMarketCapChart = ({ cmcId, symbol, theme = "dark" }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!cmcId || !containerRef.current) return;

    containerRef.current.innerHTML = "";

    const widget = document.createElement("div");
    widget.className = "coinmarketcap-w-coin-price-chart";
    widget.setAttribute("data-currency", "USD");
    widget.setAttribute("data-coin-id", cmcId);
    widget.setAttribute("data-theme", theme);
    widget.setAttribute("data-locale", "en");
    widget.setAttribute("data-transparent", "true");

    containerRef.current.appendChild(widget);

    const existingScript = document.querySelector(
      'script[src*="coinmarketcap.com/static/widget/coinPriceChart"]'
    );

    if (!existingScript) {
      const script = document.createElement("script");
      script.src =
        "https://files.coinmarketcap.com/static/widget/coinPriceChart.js";
      script.async = true;
      document.body.appendChild(script);
    } else if (window.coinmarketcap && window.coinmarketcap.widget) {
      window.coinmarketcap.widget.init();
    }
  }, [cmcId, theme]);

  if (!cmcId) {
    return (
      <div className={styles.fallback}>
        <p className={styles.fallbackTitle}>{symbol} price chart</p>
        <p className={styles.fallbackText}>Chart unavailable for this asset.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div ref={containerRef} className={styles.chartHost} />
    </div>
  );
};

export default CoinMarketCapChart;
