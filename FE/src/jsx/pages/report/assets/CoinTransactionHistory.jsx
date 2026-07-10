import React, { useMemo, useState } from "react";
import styles from "./CoinTransactionHistory.module.css";
import { formatCoinAmount } from "./coinConfig";
import TransactionDetailModal from "./TransactionDetailModal";
import {
  formatSwapPairLabel,
  getSwapDetails,
  getSwapListSubtitle,
  isSwapTransaction,
} from "./swapTransactionUtils";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "completed", label: "Completed" },
  { id: "pending", label: "Pending" },
  { id: "swap", label: "Swap" },
  { id: "sent", label: "Sent" },
  { id: "received", label: "Received" },
];

const CoinTransactionHistory = ({
  transactions,
  allTransactions = [],
  symbol,
  getFiatValue,
}) => {
  const [filter, setFilter] = useState("all");
  const [selectedTx, setSelectedTx] = useState(null);

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      const status = String(tx.status || "").toLowerCase();
      const amount = parseFloat(tx.amount || 0);

      if (filter === "completed") return status.includes("completed");
      if (filter === "pending") return status.includes("pending");
      if (filter === "swap") return isSwapTransaction(tx);
      if (filter === "sent") return amount < 0 && !isSwapTransaction(tx);
      if (filter === "received") return amount > 0 && !isSwapTransaction(tx);
      return true;
    });
  }, [transactions, filter]);

  return (
    <>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <h3>Transaction History</h3>
          <span>{filtered.length} records</span>
        </div>

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

        <div className={styles.list}>
          {filtered.length === 0 ? (
            <div className={styles.empty}>
              <p>No transactions found for this coin.</p>
            </div>
          ) : (
            filtered.map((tx, index) => {
              const amount = parseFloat(tx.amount || 0);
              const isSend = amount < 0;
              const isSwap = isSwapTransaction(tx);
              const swapDetails = isSwap ? getSwapDetails(tx, allTransactions) : null;
              const fiat = getFiatValue ? getFiatValue(tx) : null;

              return (
                <button
                  key={tx._id || `${tx.txId || "tx"}-${index}`}
                  type="button"
                  className={styles.item}
                  onClick={() => setSelectedTx(tx)}
                >
                  <div className={styles.itemLeft}>
                    <span
                      className={`${styles.badge} ${
                        isSwap
                          ? styles.badgeSwap
                          : isSend
                            ? styles.badgeSend
                            : styles.badgeReceive
                      }`}
                    >
                      {isSwap ? "Swap" : isSend ? "Sent" : "Received"}
                    </span>
                    <div>
                      <strong>
                        {isSwap && swapDetails?.from && swapDetails?.to
                          ? formatSwapPairLabel(swapDetails)
                          : `${formatCoinAmount(Math.abs(amount))} ${symbol}`}
                      </strong>
                      <p>
                        {isSwap
                          ? getSwapListSubtitle(tx, allTransactions)
                          : tx.status || "Unknown"}
                      </p>
                    </div>
                  </div>
                  <div className={styles.itemRight}>
                    {fiat && <span>{fiat}</span>}
                    <small>
                      {tx.createdAt
                        ? new Date(tx.createdAt).toLocaleString()
                        : tx.date
                          ? new Date(tx.date).toLocaleString()
                          : "—"}
                    </small>
                  </div>
                  <span className={styles.chevron} aria-hidden="true">›</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      <TransactionDetailModal
        open={Boolean(selectedTx)}
        transaction={selectedTx}
        symbol={symbol}
        fiatValue={selectedTx && getFiatValue ? getFiatValue(selectedTx) : null}
        allTransactions={allTransactions}
        onClose={() => setSelectedTx(null)}
      />
    </>
  );
};

export default CoinTransactionHistory;
