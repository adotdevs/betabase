import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./CoinDetail.module.css";
import CoinMarketCapChart from "./CoinMarketCapChart";
import CoinTransactionHistory from "./CoinTransactionHistory";
import CoinActionModal from "./CoinActionModal";
import { filterCoinTransactions, formatFiatValue } from "./coinConfig";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "history", label: "History" },
];

const CoinDetail = ({
  coin,
  isUser,
  transactions,
  onWithdraw,
}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [actionModal, setActionModal] = useState(null);

  const coinTransactions = useMemo(
    () => filterCoinTransactions(transactions, coin.trxName),
    [transactions, coin.trxName]
  );

  const fiatValue = coin.balance * (coin.price || 0);

  const getFiatValue = (tx) => {
    const amount = Math.abs(parseFloat(tx.amount || 0));
    const value = amount * (coin.price || 0);
    return formatFiatValue(value, isUser?.currency);
  };

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button type="button" className={styles.backBtn} onClick={() => navigate("/assets")}>
          ← Back to Assets
        </button>
      </div>

      <div className={styles.hero} style={{ "--coin-accent": coin.accent }}>
        <div className={styles.heroLeft}>
          <span className={styles.coinIcon}>
            {coin.logo ? <img src={coin.logo} alt={coin.name} /> : coin.symbol?.slice(0, 1)}
          </span>
          <div>
            <h1>{coin.name}</h1>
            <p>{coin.symbol} · Live price ${Number(coin.price || 0).toLocaleString(undefined, { maximumFractionDigits: coin.price > 1 ? 2 : 6 })}</p>
          </div>
        </div>
        <div className={styles.heroBalance}>
          <span>Your Holdings</span>
          <strong>{coin.balance.toFixed(8)} {coin.symbol}</strong>
          <small>{formatFiatValue(fiatValue, isUser?.currency)}</small>
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.actionBtn} onClick={() => setActionModal("receive")}>
          <span>↓</span> Receive
        </button>
        <button type="button" className={`${styles.actionBtn} ${styles.actionSend}`} onClick={() => setActionModal("send")}>
          <span>↑</span> Send
        </button>
        <button type="button" className={styles.actionBtn} onClick={() => navigate("/swap", { state: { fromCoin: coin.symbol } })}>
          <span>⇄</span> Swap
        </button>
      </div>

      <div className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className={styles.overviewGrid}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h3>Market Chart</h3>
              <span>Powered by CoinMarketCap</span>
            </div>
            <CoinMarketCapChart cmcId={coin.cmcId} symbol={coin.symbol} />
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h3>Holdings Summary</h3>
            </div>
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <span>Available</span>
                <strong>{coin.balance.toFixed(8)}</strong>
              </div>
              <div className={styles.statCard}>
                <span>Estimated Value</span>
                <strong>{formatFiatValue(fiatValue, isUser?.currency)}</strong>
              </div>
              <div className={styles.statCard}>
                <span>Transactions</span>
                <strong>{coinTransactions.length}</strong>
              </div>
              <div className={styles.statCard}>
                <span>Network Address</span>
                <strong className={styles.addressPreview}>
                  {coin.address ? `${coin.address.slice(0, 10)}...${coin.address.slice(-8)}` : "N/A"}
                </strong>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === "history" && (
        <section className={styles.panel}>
          <CoinTransactionHistory
            transactions={coinTransactions}
            symbol={coin.symbol}
            isUser={isUser}
            getFiatValue={getFiatValue}
          />
        </section>
      )}

      <CoinActionModal
        open={Boolean(actionModal)}
        mode={actionModal}
        coin={coin}
        onClose={() => setActionModal(null)}
        onSend={() => {
          setActionModal(null);
          onWithdraw(coin);
        }}
      />
    </div>
  );
};

export default CoinDetail;
