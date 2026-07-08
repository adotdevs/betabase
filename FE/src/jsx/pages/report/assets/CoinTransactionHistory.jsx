import React, { useMemo, useState } from "react";
import styles from "./CoinTransactionHistory.module.css";
import { formatCoinAmount } from "./coinConfig";
import TransactionDetailModal from "./TransactionDetailModal";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "completed", label: "Completed" },
  { id: "pending", label: "Pending" },
  { id: "sent", label: "Sent" },
  { id: "received", label: "Received" },
];

const CoinTransactionHistory = ({ transactions, symbol, getFiatValue }) => {
  const [filter, setFilter] = useState("all");
  const [selectedTx, setSelectedTx] = useState(null);

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      const status = String(tx.status || "").toLowerCase();
      const amount = parseFloat(tx.amount || 0);

      if (filter === "completed") return status.includes("completed");
      if (filter === "pending") return status.includes("pending");
      if (filter === "sent") return amount < 0;
      if (filter === "received") return amount > 0;
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
              const fiat = getFiatValue ? getFiatValue(tx) : null;

              return (
                <button
                  key={tx._id || `${tx.txId || "tx"}-${index}`}
                  type="button"
                  className={styles.item}
                  onClick={() => setSelectedTx(tx)}
                >
                  <div className={styles.itemLeft}>
                    <span className={`${styles.badge} ${isSend ? styles.badgeSend : styles.badgeReceive}`}>
                      {isSend ? "Sent" : "Received"}
                    </span>
                    <div>
                      <strong>{formatCoinAmount(Math.abs(amount))} {symbol}</strong>
                      <p>{tx.status || "Unknown"}</p>
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
        onClose={() => setSelectedTx(null)}
      />
    </>
  );
};

export default CoinTransactionHistory;
