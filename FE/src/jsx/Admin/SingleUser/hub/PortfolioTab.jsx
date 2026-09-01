import React, { useEffect, useMemo, useState } from "react";
import { getStakingRewardsApi } from "../../../../Api/Service";
import UserTokens from "../userTokens";
import UserStaking from "../userStaking";
import HubChart from "./HubChart";
import mm from "./MemberHub.module.css";
import { buildStakingByAsset, buildTokenAllocation, formatMoney, summarizeTokens } from "./hubData";

const PortfolioTab = ({ userId, tokens = [], currency = "USD" }) => {
  const [stakings, setStakings] = useState([]);
  const [loadedRewards, setLoadedRewards] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!userId) {
        setLoadedRewards(true);
        return;
      }
      try {
        const response = await getStakingRewardsApi(userId);
        if (alive && response?.success) {
          setStakings(response.stakings || []);
        }
      } catch (_error) {
        /* empty chart if rewards cannot be loaded */
      } finally {
        if (alive) setLoadedRewards(true);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [userId]);

  const tokenStats = useMemo(() => summarizeTokens(tokens), [tokens]);
  const tokenAllocation = useMemo(() => buildTokenAllocation(tokens), [tokens]);
  const stakingByAsset = useMemo(() => buildStakingByAsset(stakings), [stakings]);
  const stakedCount = stakings.length;
  const recordedProfit = stakingByAsset.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className={mm.stack}>
      <section className={mm.stats}>
        <article className={mm.stat}>
          <p className={mm.statLabel}>Total token value</p>
          <p className={mm.statValue}>{formatMoney(tokenStats.totalValue, currency)}</p>
        </article>
        <article className={mm.stat}>
          <p className={mm.statLabel}>Number of tokens</p>
          <p className={mm.statValue}>{tokenStats.count}</p>
        </article>
        <article className={mm.stat}>
          <p className={mm.statLabel}>Staking records</p>
          <p className={mm.statValue}>{stakedCount}</p>
          <p className={mm.statHint}>{loadedRewards ? "From staking transactions" : "Loading records"}</p>
        </article>
        <article className={mm.stat}>
          <p className={mm.statLabel}>Recorded staking profit</p>
          <p className={mm.statValue}>{formatMoney(recordedProfit, currency)}</p>
          <p className={mm.statHint}>Only shown when profit is stored on a record</p>
        </article>
      </section>
      <div className={mm.grid2}>
        <section className={`${mm.card} ${mm.cardPad}`}>
          <div className={mm.cardHead}>
            <div>
              <h2 className={mm.title}>Token allocation</h2>
              <p className={mm.subtitle}>Current token values only</p>
            </div>
          </div>
          <HubChart type="pie" data={tokenAllocation} emptyLabel="No token values to chart" />
        </section>
        <section className={`${mm.card} ${mm.cardPad}`}>
          <div className={mm.cardHead}>
            <div>
              <h2 className={mm.title}>Staking profit by asset</h2>
              <p className={mm.subtitle}>Uses recorded totalProfit — not estimated APY</p>
            </div>
          </div>
          <HubChart
            type="pie"
            data={stakingByAsset}
            emptyLabel="No staking reward records"
          />
        </section>
      </div>
      <p className={mm.sectionLabel}>Token holdings</p>
      <div className={mm.embed}>
        <UserTokens embedded />
      </div>
      <p className={mm.sectionLabel}>Staking settings</p>
      <div className={mm.embed}>
        <UserStaking embedded />
      </div>
    </div>
  );
};

export default PortfolioTab;
