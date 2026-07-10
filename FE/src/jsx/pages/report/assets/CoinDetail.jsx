import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./CoinDetail.module.css";
import CoinMarketCapChart from "./CoinMarketCapChart";
import CoinTransactionHistory from "./CoinTransactionHistory";
import CoinActionModal from "./CoinActionModal";
import {
  filterCoinTransactions,
  formatCoinAmount,
  formatFiatValue,
  getActivationStatusLabel,
  isCoinActive,
} from "./coinConfig";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "history", label: "History" },
];

const CoinDetail = ({
  coin,
  isUser,
  transactions,
  onWithdraw,
  onRequestActivation,
  activatingCoinTrx = "",
}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [actionModal, setActionModal] = useState(null);
  const [addressCopied, setAddressCopied] = useState(false);

  const coinTransactions = useMemo(
    () => filterCoinTransactions(transactions, coin.trxName),
    [transactions, coin.trxName]
  );

  const fiatValue = coin.balance * (coin.price || 0);
  const hasAddress = Boolean(String(coin.address || "").trim());
  const isActive = isCoinActive(coin);
  const isPending = coin.activationStatus === "pending";
  const isInactive = coin.activationStatus === "inactive";

  const getFiatValue = (tx) => {
    const amount = Math.abs(parseFloat(tx.amount || 0));
    const value = amount * (coin.price || 0);
    return formatFiatValue(value, isUser?.currency);
  };

  const handleCopyAddress = async () => {
    if (!coin.address) return;
    try {
      await navigator.clipboard.writeText(coin.address);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
    } catch (error) {
      console.error("Copy failed", error);
    }
  };

  return (
    <div className={styles.page}>
      <button type="button" className={styles.backBtn} onClick={() => navigate("/assets")}>
        ← All assets
      </button>

      <section className={styles.hero} style={{ "--coin-accent": coin.accent }}>
        <div className={styles.heroMain}>
          <span className={styles.coinIcon}>
            {coin.logo ? <img src={coin.logo} alt={coin.name} /> : coin.symbol?.slice(0, 1)}
          </span>
          <div className={styles.heroText}>
            <h1>{coin.name}</h1>
            <p>{coin.symbol} · {formatFiatValue(coin.price || 0, isUser?.currency)}</p>
          </div>
        </div>
        <div className={styles.heroBalance}>
          <span className={styles.balanceLabel}>Your balance</span>
          <strong>{formatCoinAmount(coin.balance)} {coin.symbol}</strong>
          <small>{formatFiatValue(fiatValue, isUser?.currency)}</small>
          <span
            className={`${styles.statusChip} ${
              isActive
                ? styles.statusActive
                : isPending
                  ? styles.statusPending
                  : styles.statusInactive
            }`}
          >
            {getActivationStatusLabel(coin.activationStatus)}
          </span>
        </div>
      </section>

      {!isActive && (
        <section
          className={`${styles.activationPanel} ${
            isPending ? styles.activationPanelPending : styles.activationPanelInactive
          }`}
        >
          <div>
            <strong>
              {isPending ? "Wallet activation in progress" : "Wallet not activated"}
            </strong>
            <p>
              {isPending
                ? "Your request was sent. You will be able to receive, send, and swap once your wallet address is assigned."
                : "Activate this wallet to receive deposits, send funds, and use it in swaps."}
            </p>
          </div>
          {isInactive && (
            <button
              type="button"
              className={styles.activateBtn}
              disabled={activatingCoinTrx === coin.trxName}
              onClick={() => onRequestActivation?.(coin)}
            >
              {activatingCoinTrx === coin.trxName ? "Submitting..." : "Activate wallet"}
            </button>
          )}
        </section>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionBtn}
          disabled={!isActive || !hasAddress}
          onClick={() => isActive && hasAddress && setActionModal("receive")}
        >
          <em>↓</em>
          <span>Receive</span>
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionQr}`}
          disabled={!isActive || !hasAddress}
          onClick={() => isActive && hasAddress && setActionModal("receive")}
        >
          <em className={styles.qrIcon}>▦</em>
          <span>QR Code</span>
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionSend}`}
          disabled={!isActive}
          onClick={() => isActive && setActionModal("send")}
        >
          <em>↑</em>
          <span>Send</span>
        </button>
        <button
          type="button"
          className={styles.actionBtn}
          disabled={!isActive}
          onClick={() =>
            isActive &&
            navigate("/swap", {
              state: {
                fromCoin: coin.symbol,
                fromTrxName: coin.trxName,
                fromSlug: coin.slug,
              },
            })
          }
        >
          <em>⇄</em>
          <span>Swap</span>
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
              <h3>Price chart</h3>
            </div>
            <CoinMarketCapChart slug={coin.slug} cmcId={coin.cmcId} symbol={coin.symbol} />
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h3>Holdings</h3>
            </div>
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <span>Available</span>
                <strong>{formatCoinAmount(coin.balance)} {coin.symbol}</strong>
              </div>
              <div className={styles.statCard}>
                <span>Estimated value</span>
                <strong>{formatFiatValue(fiatValue, isUser?.currency)}</strong>
              </div>
              <div className={styles.statCard}>
                <span>Transactions</span>
                <strong>{coinTransactions.length}</strong>
              </div>
            </div>

            {isActive && hasAddress && (
              <div className={styles.addressSection}>
                <span className={styles.addressLabel}>Wallet address</span>
                <div className={styles.addressBox}>
                  <span className={styles.addressText}>{coin.address}</span>
                </div>
                <div className={styles.addressActions}>
                  <button type="button" className={styles.addressBtn} onClick={handleCopyAddress}>
                    {addressCopied ? "Copied" : "Copy address"}
                  </button>
                  <button
                    type="button"
                    className={`${styles.addressBtn} ${styles.addressBtnPrimary}`}
                    onClick={() => setActionModal("receive")}
                  >
                    ▦ Show QR code
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === "history" && (
        <section className={styles.panel}>
          <CoinTransactionHistory
            transactions={coinTransactions}
            allTransactions={transactions}
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
