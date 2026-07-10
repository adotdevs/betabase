import React, { useState } from "react";
import styles from "./TransactionDetailModal.module.css";
import { formatCoinAmount } from "./coinConfig";
import {
  formatSwapAmountLabel,
  formatSwapPairLabel,
  getSwapDetails,
  isSwapTransaction,
} from "./swapTransactionUtils";

const getStatusClass = (status) => {
  const value = String(status || "").toLowerCase();
  if (value.includes("completed")) return styles.statusCompleted;
  if (value.includes("pending")) return styles.statusPending;
  if (value.includes("failed")) return styles.statusFailed;
  return styles.statusUnknown;
};

const TransactionDetailModal = ({
  open,
  transaction,
  symbol,
  fiatValue,
  allTransactions = [],
  onClose,
}) => {
  const [copiedField, setCopiedField] = useState("");

  if (!open || !transaction) return null;

  const amount = parseFloat(transaction.amount || 0);
  const isSend = amount < 0;
  const timestamp = transaction.createdAt || transaction.date;
  const swapDetails = getSwapDetails(transaction, allTransactions);
  const isSwap = isSwapTransaction(transaction);

  const copyValue = async (field, value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      setCopiedField(field);
      setTimeout(() => setCopiedField(""), 2000);
    } catch (error) {
      console.error("Copy failed", error);
    }
  };

  const rows = [
    { label: "Type", value: isSwap ? "Swap" : isSend ? "Sent" : "Received" },
    isSwap && swapDetails?.from && swapDetails?.to && {
      label: "Swap pair",
      value: formatSwapPairLabel(swapDetails),
    },
    isSwap && swapDetails?.from && {
      label: "You sent",
      value: formatSwapAmountLabel(swapDetails.from.amount, swapDetails.from.symbol),
    },
    isSwap && swapDetails?.to && {
      label: "You received",
      value: formatSwapAmountLabel(swapDetails.to.amount, swapDetails.to.symbol),
    },
    !isSwap && { label: "Asset", value: symbol || transaction.trxName || "—" },
    {
      label: isSwap ? "This leg" : "Amount",
      value: `${formatCoinAmount(Math.abs(amount))} ${symbol || ""}`.trim(),
      copyKey: "amount",
      copyText: String(Math.abs(amount)),
    },
    { label: "Estimated value", value: fiatValue || "—" },
    {
      label: "Status",
      value: transaction.status || "Unknown",
      valueClass: getStatusClass(transaction.status),
    },
    {
      label: "Date",
      value: timestamp ? new Date(timestamp).toLocaleString() : "—",
    },
    !isSwap &&
      transaction.txId &&
      transaction.txId !== "placeholder" &&
      !String(transaction.txId).startsWith("swap-") && {
        label: transaction.withdraw === "bank" ? "Destination" : "Transaction ID",
        value: transaction.txId,
        copyKey: "txId",
        copyText: transaction.txId,
      },
    isSwap &&
      transaction.txId &&
      String(transaction.txId).startsWith("swap-") && {
        label: "Swap reference",
        value: transaction.txId,
        copyKey: "txId",
        copyText: transaction.txId,
      },
    transaction.selectedPayment && {
      label: "Payment method",
      value: transaction.selectedPayment,
      copyKey: "payment",
      copyText: transaction.selectedPayment,
    },
    transaction.fromAddress &&
      transaction.fromAddress !== "placeholder" &&
      transaction.fromAddress !== "swap" && {
        label: "From address",
        value: transaction.fromAddress,
        copyKey: "from",
        copyText: transaction.fromAddress,
      },
    transaction.reference && {
      label: "Reference",
      value: transaction.reference,
      copyKey: "reference",
      copyText: transaction.reference,
    },
    transaction.note &&
      !isSwap && {
        label: "Note",
        value: transaction.note,
      },
  ].filter(Boolean);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Transaction details</p>
            <h2>
              {isSwap
                ? "Asset swap"
                : isSend
                  ? "Outgoing transfer"
                  : "Incoming transfer"}
            </h2>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.body}>
          {rows.map((row) => (
            <div key={row.label} className={styles.row}>
              <span className={styles.label}>{row.label}</span>
              <div className={styles.valueWrap}>
                <span className={`${styles.value} ${row.valueClass || ""}`}>{row.value}</span>
                {row.copyKey && (
                  <button
                    type="button"
                    className={styles.copyBtn}
                    onClick={() => copyValue(row.copyKey, row.copyText)}
                  >
                    {copiedField === row.copyKey ? "Copied" : "Copy"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TransactionDetailModal;
