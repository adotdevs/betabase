import React from "react";
import { Link } from "react-router-dom";
import rowStyles from "./AdminCoinWalletRow.module.css";
import { resolveTransactionCoinMeta } from "../../pages/report/assets/transactionDisplayUtils";
import {
  formatFiatBalanceForAdmin,
  getFiatCurrencyByName,
  isFiatCoin,
} from "../../../utils/euroCoinUtils";

const actionBtnClass = `${rowStyles.btn}`;
const primaryBtnClass = `${rowStyles.btn} ${rowStyles.btnPrimary}`;

const AdminCoinWalletRow = ({
  coin,
  totalBalance,
  getCoinPrice,
  subAdminPermissions,
  onUpdateAddress,
  onDeposit,
  onWithdraw,
  userCurrency = "USD",
  userId,
}) => {
  const fiatMeta = getFiatCurrencyByName(coin.coinName);
  const isFiat = isFiatCoin(coin.coinName);
  const coinMeta = resolveTransactionCoinMeta(coin.coinName);

  return (
    <div className={rowStyles.row}>
      <div className={rowStyles.inner}>
        <div className={`${rowStyles.meta} relative flex grow items-center gap-2 px-2`}>
          <span
            className={rowStyles.coinIcon}
            style={{ "--coin-accent": coinMeta?.accent || "#5b8def" }}
          >
            {coinMeta?.logo ? (
              <img src={coinMeta.logo} alt="" />
            ) : (
              <span>{coinMeta?.symbol?.slice(0, 3) || coin.coinSymbol?.slice(0, 3)}</span>
            )}
          </span>
          <div>
            <h4 className={`${rowStyles.name} font-heading text-sm font-medium leading-tight`}>
              <span>{coin.coinName}</span>
              {isFiat && (
                <span className="ms-2 rounded bg-primary-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary-500">
                  Fiat
                </span>
              )}
            </h4>
            <p className={`${rowStyles.symbol} font-alt text-xs font-normal leading-tight`}>
              <span style={{ textTransform: "uppercase" }}>{coin.coinSymbol}</span>
            </p>
          </div>
        </div>
        <div className={`kkass ${rowStyles.side}`}>
          <div className={`${rowStyles.balanceWrap} relative flex items-center justify-end px-2`}>
            <span className={`${rowStyles.balance} font-sans text-sm`}>
              {isFiat
                ? formatFiatBalanceForAdmin(totalBalance, coin.coinName, userCurrency)
                : `${totalBalance.toFixed(8)} (${(totalBalance * getCoinPrice(coin.coinSymbol)).toFixed(2)} USD)`}
            </span>
          </div>
          <div className={`${rowStyles.actions} relative px-2`}>
            {isFiat && userId && fiatMeta?.adminPath && (
              <Link
                to={`/admin/users/${userId}/bank-accounts`}
                className={`${actionBtnClass} ml-0`}
              >
                <span>Bank account</span>
              </Link>
            )}
            {!isFiat && subAdminPermissions.editWalletAddress && (
              <button
                onClick={() =>
                  onUpdateAddress(coin.coinName, coin.tokenAddress, coin.coinSymbol, coin._id)
                }
                type="button"
                className={actionBtnClass}
              >
                <span>Update</span>
              </button>
            )}
            {subAdminPermissions.editUserWallet && (
              <>
                <button
                  onClick={() => onDeposit(coin)}
                  type="button"
                  className={primaryBtnClass}
                >
                  <span>{isFiat ? "Add balance" : "Deposit"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onWithdraw(coin)}
                  className={actionBtnClass}
                >
                  <span>Withdrawal</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminCoinWalletRow;
