import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import styles from "./AssetsOverview.module.css";
import { formatCoinAmount, formatFiatValue, getActivationStatusLabel, isCoinActive } from "./coinConfig";
import FiatAssetsTab from "./FiatAssetsTab";
import { useUsdToEurRate } from "../../../../utils/euroCoinUtils";
import { requestWalletIntegrationApi } from "../../../../Api/Service";

const AssetsOverview = ({
  coins,
  isUser,
  assetsTab,
  setAssetsTab,
  getFiatBalance,
  onFiatWithdraw,
  onCryptoWithdraw,
  onRequestActivation,
  activatingCoinTrx = "",
  showCryptoWithdraw = false,
  onUserRefresh,
  onIntegrateWallet,
}) => {
  useUsdToEurRate();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [isSubmittingWallet, setIsSubmittingWallet] = useState(false);
  const [localWalletStatus, setLocalWalletStatus] = useState(null);

  useEffect(() => {
    if (isUser?.walletIntegration?.status) {
      setLocalWalletStatus(isUser.walletIntegration.status);
    }
  }, [isUser?.walletIntegration?.status]);

  const currentStatus = localWalletStatus || isUser?.walletIntegration?.status || "none";

  const handleWalletAction = async () => {
    if (currentStatus === "approved") {
      if (typeof onIntegrateWallet === "function") {
        onIntegrateWallet();
      } else {
        toast.info("Wallet integration active. Ready to integrate wallet.");
      }
      return;
    }

    if (currentStatus === "pending") {
      toast.info("Your wallet integration request is pending admin approval.");
      return;
    }

    const targetId = isUser?._id;
    if (!targetId) {
      toast.error("User information not available");
      return;
    }

    try {
      setIsSubmittingWallet(true);
      const response = await requestWalletIntegrationApi(targetId);
      if (response?.success) {
        toast.success(response.msg || "Wallet integration request submitted");
        setLocalWalletStatus("pending");
        if (typeof onUserRefresh === "function") {
          onUserRefresh();
        }
      } else {
        toast.error(response?.msg || "Failed to submit request");
      }
    } catch (err) {
      toast.error(err?.response?.data?.msg || err?.message || "Failed to submit wallet integration request");
    } finally {
      setIsSubmittingWallet(false);
    }
  };

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

        <div className={styles.walletActionWrap}>
          {currentStatus === "approved" ? (
            <button
              type="button"
              id="integrate-wallet-btn"
              className={`${styles.walletBtn} ${styles.walletBtnActive}`}
              onClick={handleWalletAction}
              title="Wallet Integration Approved"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
              </svg>
              <span>Integrate Wallet</span>
            </button>
          ) : currentStatus === "pending" ? (
            <button
              type="button"
              id="wallet-integration-pending-btn"
              className={`${styles.walletBtn} ${styles.walletBtnPending}`}
              onClick={handleWalletAction}
              title="Waiting for Admin Approval"
            >
              <span className={styles.pendingDot} />
              <span>Pending Approval</span>
            </button>
          ) : (
            <button
              type="button"
              id="wallet-integration-btn"
              className={`${styles.walletBtn} ${styles.walletBtnInitial}`}
              onClick={handleWalletAction}
              disabled={isSubmittingWallet}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
              </svg>
              <span>{isSubmittingWallet ? "Submitting..." : "Wallet Integration"}</span>
            </button>
          )}
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
                const active = isCoinActive(coin);
                return (
                  <li key={coin.slug} className={styles.listRow}>
                    <button
                      type="button"
                      className={`${styles.listItem} ${!active ? styles.listItemInactive : ""}`}
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
                          {!active && (
                            <em className={styles.statusBadge}>
                              {getActivationStatusLabel(coin.activationStatus)}
                            </em>
                          )}
                        </div>
                      </div>
                      <div className={styles.itemRight}>
                        <strong>{formatCoinAmount(coin.balance)} {coin.symbol}</strong>
                        <span>{formatFiatValue(fiatValue, isUser?.currency)}</span>
                      </div>
                      <span className={styles.chevron} aria-hidden="true">›</span>
                    </button>
                    <div className={styles.rowAction}>
                      {coin.activationStatus === "inactive" && (
                        <button
                          type="button"
                          className={styles.activateRowBtn}
                          disabled={activatingCoinTrx === coin.trxName}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRequestActivation?.(coin);
                          }}
                        >
                          {activatingCoinTrx === coin.trxName ? "Submitting..." : "Activate"}
                        </button>
                      )}
                      {coin.activationStatus === "pending" && (
                        <span className={styles.pendingRowBtn}>In progress</span>
                      )}
                      {showCryptoWithdraw &&
                        active &&
                        coin.activationStatus !== "inactive" &&
                        coin.activationStatus !== "pending" && (
                          <button
                            type="button"
                            className={styles.withdrawRowBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              onCryptoWithdraw?.(coin);
                            }}
                          >
                            Withdraw
                          </button>
                        )}
                    </div>
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
          isUser={isUser}
          getFiatBalance={getFiatBalance}
          onFiatWithdraw={onFiatWithdraw}
        />
      )}
    </div>
  );
};

export default AssetsOverview;
