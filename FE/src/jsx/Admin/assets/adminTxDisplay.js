import {
  convertFiatToUserCurrency,
  getUserDisplayCurrency,
  isFiatCoin,
} from "../../../utils/euroCoinUtils";

export const buildAdminPriceMap = ({
  liveBtc,
  liveEth,
  liveBnb,
  liveXrp,
  liveDoge,
  liveSol,
  liveTon,
  liveLink,
  liveDot,
  liveNear,
  liveUsdc,
  liveTrx,
}) => ({
  bitcoin: Number(liveBtc) || 0,
  ethereum: Number(liveEth) || 2640,
  tether: 1,
  bnb: Number(liveBnb) || 210.25,
  xrp: Number(liveXrp) || 0.5086,
  dogecoin: Number(liveDoge) || 0.1163,
  solana: Number(liveSol) || 245.01,
  euro: 1,
  toncoin: Number(liveTon) || 5.76,
  chainlink: Number(liveLink) || 12.52,
  polkadot: Number(liveDot) || 4.76,
  "near protocol": Number(liveNear) || 5.59,
  "usd coin": Number(liveUsdc) || 0.99,
  tron: Number(liveTrx) || 0.1531,
});

export const formatAdminFiatAmount = (transaction, prices = {}, userDetail) => {
  if (!transaction) return "";

  const prefix =
    transaction.type === "deposit"
      ? "+"
      : transaction.type === "withdraw"
        ? "−"
        : Number(transaction.amount) >= 0
          ? "+"
          : "−";

  if (isFiatCoin(transaction.trxName)) {
    const converted = convertFiatToUserCurrency(
      transaction.amount,
      transaction.trxName,
      userDetail?.currency
    );
    const label = getUserDisplayCurrency(userDetail?.currency);
    return `${prefix}${Number(converted || 0).toFixed(2)} ${label}`;
  }

  const key = String(transaction.trxName || "").toLowerCase();
  const price = Number(prices[key]) || 0;
  const value = Math.abs(Number(transaction.amount || 0)) * price;
  const label = userDetail?.currency === "EUR" ? "EUR" : "USD";
  return `${prefix}${value.toFixed(2)} ${label}`;
};
