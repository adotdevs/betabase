import React from "react";
import { Link } from "react-router-dom";
import {
  formatFiatBalanceForAdmin,
  getFiatCurrencyByName,
  isFiatCoin,
} from "../../../utils/euroCoinUtils";

const actionBtnClass =
  "relative font-sans font-normal text-sm inline-flex items-center justify-center leading-5 no-underline h-8 px-3 py-2 space-x-1 border nui-focus transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed hover:enabled:shadow-none text-muted-500 bg-muted-200 border-muted-200 dark:text-white dark:bg-muted-700/40 dark:border-muted-700/40 dark:hover:enabled:bg-muted-700/60 hover:enabled:bg-muted-100 dark:active:enabled:border-muted-800 dark:active:enabled:bg-muted-800 active:enabled:bg-muted-200/50 rounded-md whitespace-nowrap shrink-0";

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

  return (
    <div className="border-muted-200 dark:border-muted-700 dark:bg-muted-800 relative w-full border bg-white transition-all duration-300 relative px-2 py-6 sm:py-4 top-px first:rounded-t-lg last:rounded-b-lg [&:not(:first-child)]:border-t-0">
      <div className="flex w-full flex-col sm:flex-row sm:items-center">
        <div
          style={{ width: "30%", flexGrow: "0" }}
          className="relative mb-4 flex grow items-center gap-2 px-6 sm:mb-0 sm:px-2 h-10"
        >
          <div className="relative inline-flex shrink-0 items-center justify-center h-10 w-10 rounded-lg bg-primary-500/20 text-primary-500 overflow-hidden">
            {isFiat && fiatMeta?.icon ? (
              <img src={fiatMeta.icon} alt={coin.coinName} className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <span className="text-xs font-bold uppercase">{coin.coinSymbol?.slice(0, 3)}</span>
            )}
          </div>
          <div>
            <h4 className="font-heading text-sm font-medium leading-tight text-muted-700 dark:text-muted-100">
              <span>{coin.coinName}</span>
              {isFiat && (
                <span className="ms-2 rounded bg-primary-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary-500">
                  Fiat
                </span>
              )}
            </h4>
            <p className="font-alt text-xs font-normal leading-tight text-muted-500 dark:text-muted-400">
              <span style={{ textTransform: "uppercase" }}>{coin.coinSymbol}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center kkass">
          <div className="relative flex h-8 items-center justify-end px-6 sm:h-10 sm:justify-center sm:px-2 w-full sm:w-auto">
            <span className="text-muted-500 dark:text-muted-400 font-sans text-sm">
              {isFiat
                ? formatFiatBalanceForAdmin(totalBalance, coin.coinName, userCurrency)
                : `${totalBalance.toFixed(8)} (${(totalBalance * getCoinPrice(coin.coinSymbol)).toFixed(2)} USD)`}
            </span>
          </div>
          <div className="relative flex min-h-8 flex-wrap sm:flex-nowrap items-center justify-end gap-2 px-6 sm:min-h-10 sm:justify-end sm:px-2 w-full sm:w-auto sm:max-w-none">
            {isFiat && userId && fiatMeta?.adminPath && (
              <Link
                to={`/admin/users/${userId}/${fiatMeta.adminPath}`}
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
                  className={actionBtnClass}
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
