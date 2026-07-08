import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import styles from "./CoinMarketCapChart.module.css";
import { getCoinGeckoId } from "./coinConfig";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

const RANGES = [
  { id: 7, label: "7D" },
  { id: 30, label: "30D" },
  { id: 90, label: "90D" },
];

const samplePrices = (points, maxPoints = 72) => {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, index) => index % step === 0 || index === points.length - 1);
};

const CoinMarketCapChart = ({ slug, symbol, cmcId }) => {
  const [days, setDays] = useState(30);
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const geckoId = getCoinGeckoId(slug);

  useEffect(() => {
    if (!geckoId) {
      setPrices([]);
      setLoading(false);
      setError(true);
      return undefined;
    }

    let cancelled = false;

    const fetchChart = async () => {
      setLoading(true);
      setError(false);

      try {
        const response = await axios.get(
          `https://api.coingecko.com/api/v3/coins/${geckoId}/market_chart`,
          {
            params: {
              vs_currency: "usd",
              days,
            },
            timeout: 15000,
          }
        );

        if (!cancelled) {
          setPrices(Array.isArray(response.data?.prices) ? response.data.prices : []);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setPrices([]);
          setError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchChart();

    return () => {
      cancelled = true;
    };
  }, [geckoId, days]);

  const chartData = useMemo(() => {
    const sampled = samplePrices(prices);

    return {
      labels: sampled.map(([timestamp]) =>
        new Date(timestamp).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
      ),
      datasets: [
        {
          data: sampled.map(([, price]) => price),
          borderColor: "#5b8def",
          backgroundColor: "rgba(91, 141, 239, 0.14)",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: "#5b8def",
          tension: 0.35,
          fill: true,
        },
      ],
    };
  }, [prices]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0f172a",
          borderColor: "rgba(148, 163, 184, 0.2)",
          borderWidth: 1,
          titleColor: "#e2e8f0",
          bodyColor: "#93c5fd",
          callbacks: {
            label: (context) => `$${Number(context.parsed.y).toFixed(2)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#64748b",
            maxTicksLimit: 6,
            font: { size: 10 },
          },
          grid: {
            color: "rgba(255, 255, 255, 0.04)",
          },
        },
        y: {
          ticks: {
            color: "#64748b",
            font: { size: 10 },
            callback: (value) => `$${Number(value).toLocaleString()}`,
          },
          grid: {
            color: "rgba(255, 255, 255, 0.06)",
          },
        },
      },
    }),
    []
  );

  if (!geckoId && !cmcId) {
    return (
      <div className={styles.fallback}>
        <p className={styles.fallbackTitle}>{symbol} price chart</p>
        <p className={styles.fallbackText}>Chart unavailable for this asset.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        {RANGES.map((range) => (
          <button
            key={range.id}
            type="button"
            className={`${styles.rangeBtn} ${days === range.id ? styles.rangeBtnActive : ""}`}
            onClick={() => setDays(range.id)}
          >
            {range.label}
          </button>
        ))}
      </div>

      <div className={styles.chartArea}>
        {loading ? (
          <div className={styles.stateMessage}>Loading chart...</div>
        ) : error || prices.length === 0 ? (
          <div className={styles.stateMessage}>Unable to load chart data right now.</div>
        ) : (
          <Line data={chartData} options={chartOptions} />
        )}
      </div>
    </div>
  );
};

export default CoinMarketCapChart;
