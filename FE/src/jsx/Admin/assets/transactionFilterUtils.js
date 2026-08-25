import { isSwapTransaction } from "../../pages/report/assets/swapTransactionUtils";

export const ADMIN_TRANSACTION_FILTERS = [
  { id: "all", label: "All" },
  { id: "completed", label: "Completed" },
  { id: "pending", label: "Pending" },
  { id: "deposit", label: "Deposit" },
  { id: "withdraw", label: "Withdraw" },
  { id: "swap", label: "Swap" },
];

export const matchesTransactionFilter = (tx, filter) => {
  const status = String(tx?.status || "").toLowerCase();
  if (filter === "completed") return status.includes("completed");
  if (filter === "pending") return status.includes("pending");
  if (filter === "deposit") return tx?.type === "deposit" && !isSwapTransaction(tx);
  if (filter === "withdraw") return tx?.type === "withdraw" && !isSwapTransaction(tx);
  if (filter === "swap") return isSwapTransaction(tx);
  return true;
};

export const transactionMatchesSearch = (tx, query) => {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const hay = [
    tx?.trxName,
    tx?.txId,
    tx?.fromAddress,
    tx?.note,
    tx?.reference,
    tx?.status,
    tx?.type,
    tx?.selectedPayment,
    tx?.withdraw,
    tx?.by,
    tx?.ownerEmail,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
};
