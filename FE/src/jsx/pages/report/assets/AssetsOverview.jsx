import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./AssetsOverview.module.css";
import { formatFiatValue } from "./coinConfig";
import EuroFiatAssetsRow from "../../../components/EuroFiatAssetsRow";
import { hasEuroBankAccountData } from "../../../components/euroAccountUtils";

const AssetsOverview = ({
  coins,
  isUser,
  assetsTab,
  setAssetsTab,
  totalPortfolioUsd,
  getEuroCryptoBalance,
  onEuroWithdraw,
}) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const filteredCoins = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return coins;
    return coins.filter(
      (coin) =>
        coin.name.toLowerCase().includes(query) ||
        coin.symbol.toLowerCase().includes(query)
    );
  }, [coins, search]);

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Portfolio</p>
          <h1 className={styles.title}>Assets</h1>
          <p className={styles.subtitle}>
            Manage your crypto holdings, send, receive, and track performance.
          </p>
        </div>
        <div className={styles.totalCard}>
          <span className={styles.totalLabel}>Total Balance</span>
          <strong className={styles.totalValue}>
            {formatFiatValue(totalPortfolioUsd, isUser?.currency)}
          </strong>
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${assetsTab === "crypto" ? styles.tabActive : ""}`}
          onClick={() => setAssetsTab("crypto")}
        >
          Crypto
        </button>
        <button
          type="button"
          className={`${styles.tab} ${assetsTab === "fiat" ? styles.tabActive : ""}`}
          onClick={() => setAssetsTab("fiat")}
        >
          Fiat
        </button>
      </div>

      {assetsTab === "crypto" && (
        <>
          <div className={styles.searchWrap}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search coins..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className={styles.grid}>
            {filteredCoins.map((coin) => {
              const fiatValue = coin.balance * (coin.price || 0);
              return (
                <button
                  key={coin.slug}
                  type="button"
                  className={styles.coinCard}
                  onClick={() => navigate(`/assets/${coin.slug}`)}
                  style={{ "--coin-accent": coin.accent }}
                >
                  <div className={styles.coinTop}>
                    <div className={styles.coinIdentity}>
                      <span className={styles.coinIcon}>
                        {coin.logo ? (
                          <img src={coin.logo} alt={coin.name} />
                        ) : (
                          <span>{coin.symbol?.slice(0, 1)}</span>
                        )}
                      </span>
                      <div>
                        <h3>{coin.name}</h3>
                        <p>{coin.symbol}</p>
                      </div>
                    </div>
                    <span className={styles.arrow}>→</span>
                  </div>
                  <div className={styles.coinBottom}>
                    <div>
                      <span className={styles.balanceLabel}>Balance</span>
                      <strong>{coin.balance.toFixed(8)} {coin.symbol}</strong>
                    </div>
                    <div className={styles.fiatValue}>
                      {formatFiatValue(fiatValue, isUser?.currency)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {assetsTab === "fiat" && (
        <div className={styles.fiatWrap}>
          <EuroFiatAssetsRow
            account={isUser?.euroBankAccount}
            balance={getEuroCryptoBalance()}
            currencyLabel={isUser?.currency === "EUR" ? "EUR" : "EUR"}
            hasBankAccount={hasEuroBankAccountData(isUser?.euroBankAccount)}
            onWithdraw={onEuroWithdraw}
          />
        </div>
      )}
    </div>
  );
};

export default AssetsOverview;
