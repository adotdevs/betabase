import React, { useState } from "react";
import styles from "./TransactionDetailModal.module.css";
import {
  formatSmartAmount,
  formatStatusLabel,
  formatTransactionDate,
  getStatusTone,
} from "./transactionDisplayUtils";
import {
  formatSwapAmountLabel,
  formatSwapPairLabel,
  getSwapDetails,
  isSwapTransaction,
} from "./swapTransactionUtils";

const getStatusClass = (status) => {
  const tone = getStatusTone(status);
  if (tone === "completed") return styles.statusCompleted;
  if (tone === "pending") return styles.statusPending;
  if (tone === "rejected") return styles.statusRejected;
  return styles.statusUnknown;
};

const truncateMiddle = (value, start = 10, end = 8) => {
  const text = String(value || "");
  if (text.length <= start + end + 3) return text;
  return `${text.slice(0, start)}…${text.slice(-end)}`;
};

const CoinIcon = ({ meta }) => {
  if (!meta) return null;

  return (
    <span className={styles.coinIcon}>
      {meta.logo ? (
        <img src={meta.logo} alt={meta.symbol} />
      ) : (
        <span className={styles.coinFallback}>{meta.symbol?.slice(0, 3)}</span>
      )}
    </span>
  );
};

const DetailRow = ({ label, value, valueClass, copyKey, copyText, copiedField, onCopy, fullWidth }) => (
  <div className={`${styles.row} ${fullWidth ? styles.rowFull : ""}`}>
    <span className={styles.label}>{label}</span>
    {copyKey ? (
      <button
        type="button"
        className={styles.copyable}
        onClick={() => onCopy(copyKey, copyText)}
      >
        <span className={`${styles.value} ${valueClass || ""}`}>{value}</span>
        <span className={styles.copyHint}>
          {copiedField === copyKey ? "Copied" : "Copy"}
        </span>
      </button>
    ) : (
      <span className={`${styles.value} ${valueClass || ""}`}>{value}</span>
    )}
  </div>
);

const buildDetailRows = ({
  transaction,
  amount,
  symbol,
  coinMeta,
  fiatValue,
  isSwap,
  swapDetails,
  statusClass,
  timestamp,
  typeLabel,
  txIdStr,
}) => {
  const rows = [];

  if (isSwap && swapDetails?.from && swapDetails?.to) {
    rows.push({
      label: "Swap pair",
      value: formatSwapPairLabel(swapDetails),
    });
  }

  if (isSwap && swapDetails?.from) {
    rows.push({
      label: "You sent",
      value: formatSwapAmountLabel(swapDetails.from.amount, swapDetails.from.symbol),
    });
  }

  if (isSwap && swapDetails?.to) {
    rows.push({
      label: "You received",
      value: formatSwapAmountLabel(swapDetails.to.amount, swapDetails.to.symbol),
    });
  }

  rows.push({
    label: "Asset",
    value: coinMeta?.name || transaction.trxName || "—",
  });

  rows.push({
    label: "Symbol",
    value: symbol || coinMeta?.symbol || "—",
  });

  rows.push({ label: "Type", value: typeLabel });

  if (transaction.withdraw) {
    rows.push({
      label: "Method",
      value: transaction.withdraw === "bank" ? "Bank transfer" : "Crypto",
    });
  }

  rows.push({
    label: isSwap ? "This leg" : "Amount",
    value: `${formatSmartAmount(Math.abs(amount))} ${symbol || coinMeta?.symbol || ""}`.trim(),
    copyKey: "amount",
    copyText: String(Math.abs(amount)),
  });

  if (fiatValue) {
    rows.push({
      label: "Estimated value",
      value: fiatValue,
      valueClass: statusClass,
    });
  }

  rows.push({
    label: "Status",
    value: formatStatusLabel(transaction.status),
    valueClass: statusClass,
  });

  rows.push({
    label: "Date & time",
    value: timestamp ? new Date(timestamp).toLocaleString() : "—",
  });

  if (!isSwap && transaction.txId && txIdStr !== "placeholder") {
    rows.push({
      label: "Transaction ID",
      value: truncateMiddle(transaction.txId),
      copyKey: "txId",
      copyText: transaction.txId,
    });
  }

  if (isSwap && txIdStr.startsWith("swap-")) {
    rows.push({
      label: "Swap reference",
      value: truncateMiddle(transaction.txId),
      copyKey: "swapRef",
      copyText: transaction.txId,
    });
  }

  if (!isSwap) {
    if (transaction.withdraw === "bank" && transaction.selectedPayment) {
      rows.push({
        label: "To",
        value: truncateMiddle(transaction.selectedPayment, 14, 10),
        copyKey: "to",
        copyText: transaction.selectedPayment,
      });
    } else if (transaction.txId && txIdStr !== "placeholder") {
      rows.push({
        label:
          transaction.by === "admin" && transaction.withdraw === "crypto"
            ? "To address"
            : "To",
        value: truncateMiddle(transaction.txId),
        copyKey: "toAddress",
        copyText: transaction.txId,
      });
    }
  }

  if (
    transaction.by === "admin" &&
    transaction.withdraw === "crypto" &&
    transaction.txId &&
    txIdStr !== "placeholder" &&
    !isSwap
  ) {
    rows.push({
      label: "Transaction hash",
      value: truncateMiddle(transaction.txId),
      copyKey: "txHash",
      copyText: transaction.txId,
    });
  }

  if (
    transaction.fromAddress &&
    transaction.fromAddress !== "placeholder" &&
    transaction.fromAddress !== "swap"
  ) {
    rows.push({
      label: "From address",
      value: truncateMiddle(transaction.fromAddress, 10, 8),
      copyKey: "from",
      copyText: transaction.fromAddress,
    });
  }

  if (transaction.selectedPayment) {
    rows.push({
      label: "Payment method",
      value: truncateMiddle(transaction.selectedPayment, 14, 10),
      copyKey: "payment",
      copyText: transaction.selectedPayment,
    });
  }

  if (transaction.reference) {
    rows.push({
      label: "Reference number",
      value: transaction.reference,
      copyKey: "reference",
      copyText: transaction.reference,
    });
  }

  if (transaction.note && !isSwap) {
    rows.push({
      label: "Note",
      value: transaction.note,
      fullWidth: true,
    });
  }

  return rows;
};

const TransactionDetailModal = ({
  open,
  transaction,
  symbol,
  fiatValue,
  coinMeta,
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
  const statusClass = getStatusClass(transaction.status);
  const txIdStr = String(transaction.txId || "");

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

  const typeLabel = isSwap
    ? "Swap"
    : transaction.type === "deposit"
      ? "Deposit"
      : transaction.type === "withdraw"
        ? "Withdraw"
        : isSend
          ? "Sent"
          : "Received";

  const headline = isSwap
    ? swapDetails?.from && swapDetails?.to
      ? `Swap ${formatSwapPairLabel(swapDetails)}`
      : "Swap"
    : `${typeLabel} ${symbol || coinMeta?.symbol || ""}`;

  const amountDisplay = `${isSend || transaction.type === "withdraw" ? "−" : "+"}${formatSmartAmount(Math.abs(amount))} ${symbol || coinMeta?.symbol || ""}`.trim();

  const detailRows = buildDetailRows({
    transaction,
    amount,
    symbol,
    coinMeta,
    fiatValue,
    isSwap,
    swapDetails,
    statusClass,
    timestamp,
    typeLabel,
    txIdStr,
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <CoinIcon meta={coinMeta} />
          <div className={styles.headerMain}>
            <div className={styles.headerTop}>
              <h2 className={styles.title}>{headline}</h2>
              <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
                ×
              </button>
            </div>
            <p className={styles.amount}>{amountDisplay}</p>
            {fiatValue && (
              <p className={`${styles.fiat} ${statusClass}`}>{fiatValue}</p>
            )}
            <div className={styles.summary}>
              <span className={`${styles.statusBadge} ${statusClass}`}>
                {formatStatusLabel(transaction.status)}
              </span>
              <span className={styles.date}>
                {timestamp ? formatTransactionDate(timestamp) : "—"}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.details}>
          {detailRows.map((row) => (
            <DetailRow
              key={row.label}
              label={row.label}
              value={row.value}
              valueClass={row.valueClass}
              copyKey={row.copyKey}
              copyText={row.copyText}
              copiedField={copiedField}
              onCopy={copyValue}
              fullWidth={row.fullWidth}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default TransactionDetailModal;
