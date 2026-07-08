import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./AssetsOverview.module.css";
import { formatCoinAmount, formatFiatValue } from "./coinConfig";
import FiatAssetsTab from "./FiatAssetsTab";

const AssetsOverview = ({
  coins,
  isUser,
  assetsTab,
  setAssetsTab,
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
      <div className={styles.topBar}>
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
      </div>

      {assetsTab === "crypto" && (
        <>
          <div className={styles.toolbar}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search by name or symbol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <section className={styles.listCard}>
            <div className={styles.listHeader}>
              <span>Asset</span>
              <span>Balance</span>
            </div>
            <ul className={styles.list}>
              {filteredCoins.map((coin) => {
                const fiatValue = coin.balance * (coin.price || 0);
                return (
                  <li key={coin.slug}>
                    <button
                      type="button"
                      className={styles.listItem}
                      onClick={() => navigate(`/assets/${coin.slug}`)}
                      style={{ "--coin-accent": coin.accent }}
                    >
                      <div className={styles.itemLeft}>
                        <span className={styles.coinIcon}>
                          {coin.logo ? (
                            <img src={coin.logo} alt={coin.name} />
                          ) : (
                            <span>{coin.symbol?.slice(0, 1)}</span>
                          )}
                        </span>
                        <div className={styles.itemMeta}>
                          <strong>{coin.name}</strong>
                          <span>{coin.symbol}</span>
                        </div>
                      </div>
                      <div className={styles.itemRight}>
                        <strong>{formatCoinAmount(coin.balance)} {coin.symbol}</strong>
                        <span>{formatFiatValue(fiatValue, isUser?.currency)}</span>
                      </div>
                      <span className={styles.chevron} aria-hidden="true">›</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {filteredCoins.length === 0 && (
              <div className={styles.listEmpty}>No coins match your search.</div>
            )}
          </section>
        </>
      )}

      {assetsTab === "fiat" && (
        <FiatAssetsTab
          account={isUser?.euroBankAccount}
          balance={getEuroCryptoBalance()}
          currencyLabel={isUser?.currency === "EUR" ? "EUR" : "EUR"}
          onWithdraw={onEuroWithdraw}
        />
      )}
    </div>
  );
};

export default AssetsOverview;
