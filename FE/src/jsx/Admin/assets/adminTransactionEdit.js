import { isFiatTrxNameForAdmin } from "../../../utils/euroCoinUtils";
import { isSwapTransaction } from "../../pages/report/assets/swapTransactionUtils";

export const ADMIN_TRX_NAME_OPTIONS = [
  "bitcoin",
  "ethereum",
  "tether",
  "BNB",
  "XRP",
  "Dogecoin",
  "Solana",
  "Toncoin",
  "Chainlink",
  "Polkadot",
  "Near Protocol",
  "USD Coin",
  "Tron",
  "Euro",
  "Dollar",
  "Swiss Franc",
  "Danish Krone",
];

export const mapTxToEditState = (data = {}) => ({
  _id: data._id || "",
  amount: data.amount,
  txId: data.txId || "",
  fromAddress: data.fromAddress || "",
  note: data.note || "",
  reference: data.reference || "",
  withdraw: data.withdraw || "admin",
  selectedPayment: data.selectedPayment || "",
  createdAt: data.createdAt || "",
  trxName: data.trxName || "",
  type: data.type || "",
  isHidden: Boolean(data.isHidden),
  by: data.by || "",
  isTrading: Boolean(data.isTrading),
  tradingStatus: data.tradingStatus || "",
  tradingTime: data.tradingTime || "",
  totalProfit: data.totalProfit ?? "",
  startDate: data.startDate || "",
  lastProfitDate: data.lastProfitDate || "",
  closedAt: data.closedAt || "",
  stakingData: data.stakingData
    ? {
        isStaking: Boolean(data.stakingData.isStaking),
        duration: data.stakingData.duration ?? "",
        interestRate: data.stakingData.interestRate ?? "",
        expectedReward: data.stakingData.expectedReward ?? "",
        actualReward: data.stakingData.actualReward ?? "",
        stakingStart: data.stakingData.stakingStart || "",
        stakingEnd: data.stakingData.stakingEnd || "",
        isRewardDistributed: Boolean(data.stakingData.isRewardDistributed),
        rewardDistributionDate: data.stakingData.rewardDistributionDate || "",
        stakingType: data.stakingData.stakingType || "",
        coin: data.stakingData.coin || "",
        status: data.stakingData.status || "",
      }
    : null,
});

export const parseSwapNote = (note) => {
  if (!note) return null;
  try {
    const parsed = JSON.parse(note);
    if (parsed?.kind === "swap") return parsed;
  } catch (_) {
    // plain-text notes are allowed
  }
  return null;
};

const toOptionalNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const toOptionalDate = (value) => {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

export const signedAmountForType = (amount, type) => {
  const absAmount = Math.abs(Number(amount));
  if (!Number.isFinite(absAmount)) return 0;
  return String(type || "").toLowerCase() === "withdraw" ? -absAmount : absAmount;
};

export const timestampFromDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const validateAdminTransactionEdit = ({ tx, status, type, createdAt, dateError }) => {
  if (dateError) return dateError;
  if (!tx?._id) return "Transaction id is required.";
  if (!String(tx.trxName || "").trim()) return "Asset is required.";
  if (!status) return "Status is required.";
  if (!type) return "Type is required.";
  if (!createdAt) return "Date is required.";
  const amount = Math.abs(Number(tx.amount));
  if (!Number.isFinite(amount) || amount === 0) return "Amount is required.";
  if (!isFiatTrxNameForAdmin(tx.trxName)) {
    if (!String(tx.txId || "").trim()) return "Transaction ID is required.";
    if (!String(tx.fromAddress || "").trim()) return "From address is required.";
  }
  return "";
};

export const buildAdminTransactionUpdateBody = ({ tx, status, type, createdAt }) => {
  const body = {
    _id: tx._id,
    amount: signedAmountForType(tx.amount, type),
    txId: tx.txId || "",
    fromAddress: tx.fromAddress || "",
    note: tx.note || "",
    reference: tx.reference || "",
    withdraw: tx.withdraw || "admin",
    selectedPayment: tx.selectedPayment || "",
    trxName: tx.trxName,
    type,
    status,
    createdAt,
    isHidden: Boolean(tx.isHidden),
    by: tx.by || "admin",
    isTrading: Boolean(tx.isTrading),
  };

  if (tx.tradingStatus) body.tradingStatus = tx.tradingStatus;
  if (tx.tradingTime) body.tradingTime = tx.tradingTime;
  const totalProfit = toOptionalNumber(tx.totalProfit);
  if (totalProfit !== undefined) body.totalProfit = totalProfit;
  const startDate = toOptionalDate(tx.startDate);
  if (startDate) body.startDate = startDate;
  const lastProfitDate = toOptionalDate(tx.lastProfitDate);
  if (lastProfitDate) body.lastProfitDate = lastProfitDate;
  const closedAt = toOptionalDate(tx.closedAt);
  if (closedAt) body.closedAt = closedAt;

  if (tx.stakingData && (tx.stakingData.isStaking || tx.stakingData.status)) {
    body.stakingData = {
      isStaking: Boolean(tx.stakingData.isStaking),
      duration: toOptionalNumber(tx.stakingData.duration),
      interestRate: toOptionalNumber(tx.stakingData.interestRate),
      expectedReward: toOptionalNumber(tx.stakingData.expectedReward),
      actualReward: toOptionalNumber(tx.stakingData.actualReward),
      stakingStart: toOptionalDate(tx.stakingData.stakingStart),
      stakingEnd: toOptionalDate(tx.stakingData.stakingEnd),
      isRewardDistributed: Boolean(tx.stakingData.isRewardDistributed),
      rewardDistributionDate: toOptionalDate(tx.stakingData.rewardDistributionDate),
      stakingType: tx.stakingData.stakingType || undefined,
      coin: tx.stakingData.coin || undefined,
      status: tx.stakingData.status || undefined,
    };
  }

  return body;
};

export const patchSwapNoteField = (tx, path, value) => {
  const parsed = parseSwapNote(tx.note) || {
    kind: "swap",
    from: { trxName: tx.trxName, symbol: "", amount: Math.abs(Number(tx.amount) || 0) },
    to: { trxName: "", symbol: "", amount: 0 },
  };
  const next = JSON.parse(JSON.stringify(parsed));
  if (path === "from.amount") next.from = { ...(next.from || {}), amount: Number(value) || 0 };
  if (path === "to.amount") next.to = { ...(next.to || {}), amount: Number(value) || 0 };
  if (path === "from.trxName") next.from = { ...(next.from || {}), trxName: value };
  if (path === "to.trxName") next.to = { ...(next.to || {}), trxName: value };

  const updated = { ...tx, note: JSON.stringify(next) };
  const amount = Number(tx.amount);
  if (path === "from.amount" && amount < 0) updated.amount = -Math.abs(Number(value) || 0);
  if (path === "to.amount" && amount > 0) updated.amount = Math.abs(Number(value) || 0);
  return updated;
};

export { isSwapTransaction };
