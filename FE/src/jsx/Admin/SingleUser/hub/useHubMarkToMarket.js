import { useEffect, useMemo, useState } from "react";
import {
  buildMarkToMarketSeries,
  coinsHeldInSeries,
  hasUsableHistory,
  loadDailyPriceMaps,
  needsMarketHistory,
  replayDailyHoldings,
} from "./hubMarkToMarket";

const empty = { loading: false, points: [], hasData: false, changePct: null, lastValue: 0 };

const useHubMarkToMarket = ({ transactions = [], period = "30d", currency = "USD", livePrices = {} }) => {
  const dailyHoldings = useMemo(
    () => replayDailyHoldings(transactions, period),
    [transactions, period]
  );
  const heldCoins = useMemo(() => coinsHeldInSeries(dailyHoldings), [dailyHoldings]);
  const heldKey = heldCoins.join("|");
  const [priceMaps, setPriceMaps] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const coins = heldKey ? heldKey.split("|") : [];
    if (!coins.length) {
      setPriceMaps({});
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    loadDailyPriceMaps(coins, period, currency)
      .then((maps) => {
        if (!cancelled) setPriceMaps(maps || {});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [heldKey, period, currency]);

  const series = useMemo(
    () => buildMarkToMarketSeries({ dailyHoldings, priceMaps, livePrices, currency }),
    [dailyHoldings, priceMaps, livePrices, currency]
  );

  if (!heldCoins.length) return empty;
  if (needsMarketHistory(heldCoins) && !loading && !hasUsableHistory(priceMaps)) {
    return { loading: false, points: [], hasData: false, changePct: null, lastValue: 0 };
  }
  return { loading, ...series };
};

export default useHubMarkToMarket;
