import React from "react";
import { Link } from "react-router-dom";
import {
  formatSmartAmount,
  formatStatusLabel,
  formatTransactionDate,
  getStatusTone,
  getTransactionTypeLabel,
  resolveTransactionCoinMeta,
} from "../../pages/report/assets/transactionDisplayUtils";
import {
  formatSwapPairLabel,
  getSwapDetails,
  isSwapTransaction,
  trxNameToSymbol,
} from "../../pages/report/assets/swapTransactionUtils";
import { formatAdminFiatAmount } from "./adminTxDisplay";
import AdminSkeleton from "../theme/AdminSkeleton";
import styles from "./AdminTransactions.module.css";

const toneClass = {
  completed: styles.chipSuccess,
  pending: styles.chipWarning,
  rejected: styles.chipDanger,
};

const fiatToneClass = {
  completed: styles.fiatSuccess,
  pending: styles.fiatWarning,
  rejected: styles.fiatDanger,
};

const CoinIcon = ({ meta }) => (
  <span
    className={styles.coin}
    style={{ "--coin-accent": meta?.accent || "#5b8def" }}
  >
    {meta?.logo ? (
      <img src={meta.logo} alt="" />
    ) : (
      <span>{meta?.symbol?.slice(0, 3)}</span>
    )}
  </span>
);

const AdminTransactionRow = ({
  transaction,
  allTransactions,
  prices,
  userDetail,
  onOpen,
}) => {
  const isSwap = isSwapTransaction(transaction);
  const swapDetails = isSwap ? getSwapDetails(transaction, allTransactions) : null;
  const coinMeta = resolveTransactionCoinMeta(transaction.trxName);
  const symbol = trxNameToSymbol(transaction.trxName);
  const typeLabel = getTransactionTypeLabel(transaction, swapDetails);
  const statusTone = getStatusTone(transaction.status);
  const isOut =
    transaction.type === "withdraw" ||
    (!isSwap && parseFloat(transaction.amount) < 0);

  const headline = isSwap
    ? swapDetails?.from && swapDetails?.to
      ? `Swap ${formatSwapPairLabel(swapDetails)}`
      : "Swap"
    : `${typeLabel} ${symbol}`;

  const ownerEmail = transaction.ownerEmail || userDetail?.email || "";
  const ownerUserId = transaction.ownerUserId || userDetail?._id || "";

  return (
    <div className={styles.row}>
      <CoinIcon meta={coinMeta} />
      <div className={styles.meta}>
        <p className={styles.rowTitle}>{headline}</p>
        {ownerEmail ? (
          ownerUserId ? (
            <Link
              to={`/admin/user/${ownerUserId}/general`}
              className={styles.userLink}
              onClick={(e) => e.stopPropagation()}
            >
              {ownerEmail}
            </Link>
          ) : (
            <span className={styles.userLink}>{ownerEmail}</span>
          )
        ) : null}
        <p className={styles.rowSub}>
          {formatTransactionDate(transaction.createdAt)}
          <span className={`${styles.chip} ${toneClass[statusTone] || ""}`}>
            {formatStatusLabel(transaction.status)}
          </span>
          {transaction.isHidden ? (
            <span className={`${styles.chip} ${styles.chipHidden}`}>Hidden</span>
          ) : null}
        </p>
      </div>
      <div className={styles.amounts}>
        <span className={styles.crypto}>
          {isOut ? "−" : "+"}
          {formatSmartAmount(transaction.amount)} {symbol}
        </span>
        <span className={`${styles.fiat} ${fiatToneClass[statusTone] || ""}`}>
          {formatAdminFiatAmount(transaction, prices, userDetail)}
        </span>
      </div>
      <button
        type="button"
        className={styles.iconBtn}
        onClick={() => onOpen(transaction)}
        aria-label="Edit transaction"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 12s4-8 11-8s11 8 11 8s-4 8-11 8s-11-8-11-8" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    </div>
  );
};

const AdminTransactionList = ({
  items,
  allTransactions,
  prices,
  userDetail,
  onOpen,
  loading,
}) => {
  if (loading) {
    return <AdminSkeleton variant="list" rows={6} />;
  }

  if (!items?.length) {
    return (
      <div className={`${styles.listCard} ${styles.empty}`}>
        <h4 className={styles.emptyTitle}>No transactions found</h4>
        <p className={styles.emptyCopy}>Try changing the filter or search.</p>
      </div>
    );
  }

  return (
    <section className={styles.listCard}>
      {items.map((transaction, index) => (
        <AdminTransactionRow
          key={transaction._id || `${transaction.txId || "tx"}-${index}`}
          transaction={transaction}
          allTransactions={allTransactions}
          prices={prices}
          userDetail={userDetail}
          onOpen={onOpen}
        />
      ))}
    </section>
  );
};

export default AdminTransactionList;
