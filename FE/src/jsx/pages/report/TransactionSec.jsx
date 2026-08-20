import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuthUser } from "react-auth-kit";
import { getsignUserApi, getUserCoinApi } from "../../../Api/Service";
import { isFiatCoin, convertFiatToUserCurrency, getUserDisplayCurrency, extractLivePrices, useUsdToEurRate } from "../../../utils/euroCoinUtils";
import { Spinner } from "react-bootstrap";
import styles from "./TransactionSec.module.css";
import TransactionDetailModal from "./assets/TransactionDetailModal";
import {
  formatSwapPairLabel,
  getSwapDetails,
  isSwapTransaction,
  shouldShowTransaction,
  trxNameToSymbol,
} from "./assets/swapTransactionUtils";
import {
  formatSmartAmount,
  formatTransactionDate,
  getStatusTone,
  getTransactionTypeLabel,
  resolveTransactionCoinMeta,
} from "./assets/transactionDisplayUtils";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "completed", label: "Completed" },
  { id: "pending", label: "Pending" },
  { id: "deposit", label: "Deposit" },
  { id: "withdraw", label: "Withdraw" },
  { id: "swap", label: "Swap" },
];

const fiatClassMap = {
  completed: styles.fiatCompleted,
  pending: styles.fiatPending,
  rejected: styles.fiatRejected,
  unknown: styles.fiatUnknown,
};

const CoinIcon = ({ meta }) => (
  <span
    className={styles.coinIcon}
    style={{ "--coin-accent": meta?.accent || "#5b8def" }}
  >
    {meta?.logo ? (
      <img src={meta.logo} alt={meta.symbol} />
    ) : (
      <span className={styles.coinFallback}>{meta?.symbol?.slice(0, 3)}</span>
    )}
  </span>
);

const TransactionSec = () => {
    useUsdToEurRate();
    const [isLoading, setisLoading] = useState(true);
    const [UserTransactions, setUserTransactions] = useState([]);
  const [singleTransaction, setsingleTransaction] = useState(null);
  const [isUser, setIsUser] = useState({});
  const [filter, setFilter] = useState("all");
  const [pricePayload, setPricePayload] = useState(null);

  const { id } = useParams();
  const authUser = useAuthUser();
  const Navigate = useNavigate();

    const getsignUser = async () => {
        try {
            const formData = new FormData();
            formData.append("id", authUser().user._id);
            const userCoins = await getsignUserApi(formData);

            if (userCoins.success) {
                setIsUser(userCoins.signleUser);
            } else {
                toast.dismiss();
                toast.error(userCoins.msg);
            }
        } catch (error) {
            toast.dismiss();
            toast.error(error);
        }
    };

    const getTransactions = async () => {
        try {
      const allTransactions = await getUserCoinApi(id);
      if (allTransactions.success) {
                setUserTransactions(allTransactions.getCoin.transactions.reverse());
        setPricePayload(allTransactions);
            } else {
                toast.dismiss();
                toast.error(allTransactions.msg);
            }
        } catch (error) {
            toast.dismiss();
            toast.error(error);
        } finally {
            setisLoading(false);
        }
    };

    useEffect(() => {
        getsignUser();
        if (authUser().user.role === "admin") {
            Navigate("/admin/dashboard");
            return;
    }
    if (authUser().user.role === "user" && authUser().user._id !== id) {
                Navigate("/dashboard");
            }
        getTransactions();
    }, []);

    const livePrices = useMemo(
      () => extractLivePrices(pricePayload, isUser?.currency),
      [pricePayload, isUser?.currency]
    );

    const prices = {
        bitcoin: livePrices.btc || 0,
        ethereum: livePrices.eth || 0,
        tether: livePrices.usdt || 1,
        bnb: livePrices.bnb || 0,
        xrp: livePrices.xrp || 0,
        dogecoin: livePrices.doge || 0,
        euro: 1,
        solana: livePrices.sol || 0,
        toncoin: livePrices.ton || 0,
        chainlink: livePrices.link || 0,
        polkadot: livePrices.dot || 0,
        "near protocol": livePrices.near || 0,
        "usd coin": livePrices.usdc || 0,
    tron: livePrices.trx || 0,
    };

    const calculateTransactionValue = (transaction) => {
    if (isFiatCoin(transaction.trxName)) {
      return convertFiatToUserCurrency(
        transaction.amount,
        transaction.trxName,
        isUser.currency
      ).toFixed(2);
        }

        const price = prices[transaction.trxName.toLowerCase()] || 0;
        const value = Math.abs(parseFloat(transaction.amount)) * price;
        return value.toFixed(2);
    };

  const getFiatLabel = (trxName) => {
    if (isFiatCoin(trxName)) {
      return getUserDisplayCurrency(isUser.currency);
    }
    return isUser.currency === "EUR" ? "EUR" : "USD";
  };

  const getTransactionFiatDisplay = (transaction) => {
    const convertedPrice = calculateTransactionValue(transaction);
    const fiatLabel = getFiatLabel(transaction.trxName);
    const prefix =
      transaction.type === "deposit"
        ? "+"
        : transaction.type === "withdraw"
          ? "-"
          : parseFloat(transaction.amount) >= 0
            ? "+"
            : "-";
    return `${prefix}${convertedPrice} ${fiatLabel}`;
  };

  const visibleTransactions = UserTransactions.filter(shouldShowTransaction);

  const filteredTransactions = useMemo(() => {
    return visibleTransactions.filter((tx) => {
      const status = String(tx.status || "").toLowerCase();
      if (filter === "completed") return status.includes("completed");
      if (filter === "pending") return status.includes("pending");
      if (filter === "deposit") return tx.type === "deposit" && !isSwapTransaction(tx);
      if (filter === "withdraw") return tx.type === "withdraw" && !isSwapTransaction(tx);
      if (filter === "swap") return isSwapTransaction(tx);
      return true;
    });
  }, [visibleTransactions, filter]);

  const selectedCoinMeta = singleTransaction
    ? resolveTransactionCoinMeta(singleTransaction.trxName)
    : null;

    return (
        <>
      <div className={styles.page}>
        <div className={styles.topBar}>
                                        <div>
            <h1 className={styles.pageTitle}>Transactions</h1>
            <p className={styles.pageSubtitle}>Deposits, withdrawals, and swaps</p>
                                                        </div>
          {!isLoading && (
            <span className={styles.recordCount}>
              {filteredTransactions.length} record{filteredTransactions.length === 1 ? "" : "s"}
            </span>
                            )}
                        </div>

        {!isLoading && (
          <div className={styles.filters}>
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.filterBtn} ${filter === item.id ? styles.filterActive : ""}`}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
                            </div>
        )}

        {isLoading ? (
          <div className={styles.loading}>
            <Spinner animation="border" variant="primary" size="sm" />
            <h4>Loading transactions</h4>
            <p>Fetching your latest activity…</p>
                            </div>
        ) : filteredTransactions.length === 0 ? (
          <div className={`${styles.listCard} ${styles.empty}`}>
            <h4>No transactions found</h4>
            <p>Try changing the filter or check back later.</p>
                            </div>
        ) : (
          <section className={styles.listCard}>
            <ul className={styles.list}>
              {filteredTransactions.map((transaction, index) => {
                const isSwap = isSwapTransaction(transaction);
                const swapDetails = isSwap
                  ? getSwapDetails(transaction, UserTransactions)
                  : null;
                const coinMeta = resolveTransactionCoinMeta(transaction.trxName);
                const symbol = trxNameToSymbol(transaction.trxName);
                const typeLabel = getTransactionTypeLabel(transaction, swapDetails);
                const statusTone = getStatusTone(transaction.status);
                const showFiat =
                  transaction.type === "deposit" || transaction.type === "withdraw";

                const isOut =
                  transaction.type === "withdraw" ||
                  (!isSwap && parseFloat(transaction.amount) < 0);

                const headline = isSwap
                  ? swapDetails?.from && swapDetails?.to
                    ? `Swap ${formatSwapPairLabel(swapDetails)}`
                    : "Swap"
                  : `${typeLabel} ${symbol}`;

                return (
                  <li
                    key={transaction._id || `${transaction.txId || "tx"}-${index}`}
                    className={styles.listRow}
                  >
                    <button
                      type="button"
                      className={styles.item}
                      onClick={() => setsingleTransaction(transaction)}
                    >
                      <CoinIcon meta={coinMeta} />

                      <div className={styles.itemMeta}>
                        <span className={styles.itemTitle}>{headline}</span>
                        <span className={styles.itemDate}>
                          {formatTransactionDate(transaction.createdAt)}
                        </span>
                            </div>

                      <div className={styles.itemRight}>
                        <span className={styles.cryptoAmount}>
                          {isOut ? "−" : "+"}
                          {formatSmartAmount(transaction.amount)} {symbol}
                        </span>
                        {showFiat && (
                          <span
                            className={`${styles.fiatAmount} ${fiatClassMap[statusTone]}`}
                          >
                            {getTransactionFiatDisplay(transaction)}
                          </span>
                        )}
                            </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
                            </div>

      <TransactionDetailModal
        open={Boolean(singleTransaction)}
        transaction={singleTransaction}
        symbol={
          singleTransaction ? trxNameToSymbol(singleTransaction.trxName) : ""
        }
        fiatValue={
          singleTransaction ? getTransactionFiatDisplay(singleTransaction) : null
        }
        coinMeta={selectedCoinMeta}
        allTransactions={UserTransactions}
        onClose={() => setsingleTransaction(null)}
      />
    </>
    );
};

export default TransactionSec;
