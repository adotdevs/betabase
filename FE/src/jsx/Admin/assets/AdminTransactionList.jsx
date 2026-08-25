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
import "./AdminTransactions.css";

const CoinIcon = ({ meta }) => (
  <span
    className="admin-tx-coin"
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
    <div className="admin-tx-row">
      <CoinIcon meta={coinMeta} />
      <div className="admin-tx-row-meta">
        <p className="admin-tx-row-title">{headline}</p>
        {ownerEmail ? (
          ownerUserId ? (
            <Link
              to={`/admin/user/${ownerUserId}/general`}
              className="admin-tx-user-link"
              onClick={(e) => e.stopPropagation()}
            >
              {ownerEmail}
            </Link>
          ) : (
            <span className="admin-tx-user-link is-static">{ownerEmail}</span>
          )
        ) : null}
        <p className="admin-tx-row-sub">
          {formatTransactionDate(transaction.createdAt)}
          <span className={`admin-tx-chip is-${statusTone}`}>
            {formatStatusLabel(transaction.status)}
          </span>
          {transaction.isHidden ? (
            <span className="admin-tx-chip is-hidden">Hidden</span>
          ) : null}
        </p>
      </div>
      <div className="admin-tx-row-amounts">
        <span className="admin-tx-crypto">
          {isOut ? "−" : "+"}
          {formatSmartAmount(transaction.amount)} {symbol}
        </span>
        <span className={`admin-tx-fiat is-${statusTone}`}>
          {formatAdminFiatAmount(transaction, prices, userDetail)}
        </span>
      </div>
      <button
        type="button"
        className="admin-tx-icon-btn"
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
    return (
      <div className="admin-tx-list-card admin-tx-empty">
        <h4>Loading transactions</h4>
        <p>Fetching the latest activity…</p>
      </div>
    );
  }

  if (!items?.length) {
    return (
      <div className="admin-tx-list-card admin-tx-empty">
        <h4>No transactions found</h4>
        <p>Try changing the filter or search.</p>
      </div>
    );
  }

  return (
    <section className="admin-tx-list-card">
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
