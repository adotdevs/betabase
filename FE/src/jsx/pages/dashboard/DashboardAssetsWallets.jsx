import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthUser } from "react-auth-kit";
import { toast } from "react-toastify";
import {
  getCoinsUserApi,
  getsignUserApi,
  patchCoinsApi,
  requestCoinActivationApi,
} from "../../../Api/Service";
import { getFiatBalanceFromCoins } from "../../../utils/euroCoinUtils";
import AssetsOverview from "../report/assets/AssetsOverview";
import AssetWithdrawModals from "../report/assets/AssetWithdrawModals";
import { useAssetWithdraw } from "../report/assets/useAssetWithdraw";
import {
  buildPortfolioCoins,
  getTransactionsForCoin,
} from "../report/assets/coinConfig";
import styles from "./DashboardAssetsWallets.module.css";

const parsePrice = (priceObj, fallback) =>
  priceObj?.quote?.USD?.price ?? fallback;

const sumCompletedBalance = (transactions, trxName) => {
  if (!transactions) return 0;
  return transactions
    .filter(
      (tx) => tx.trxName.includes(trxName) && tx.status.includes("completed")
    )
    .reduce((acc, tx) => acc + tx.amount, 0);
};

const DashboardAssetsWallets = () => {
  const authUser = useAuthUser();
  const [isLoading, setisLoading] = useState(true);
  const [UserData, setUserData] = useState(null);
  const [userCoins, setuserCoins] = useState(null);
  const [newUserCoins, setnewUserCoins] = useState(null);
  const [isUser, setIsUser] = useState({});
  const [assetsTab, setAssetsTab] = useState("crypto");
  const [activatingCoinTrx, setActivatingCoinTrx] = useState("");
  const [btcBalance, setbtcBalance] = useState(0);
  const [ethBalance, setethBalance] = useState(0);
  const [usdtBalance, setusdtBalance] = useState(0);
  const [liveBtc, setliveBtc] = useState(null);
  const [liveEth, setliveEth] = useState(null);
  const [liveBnb, setliveBnb] = useState(null);
  const [liveXrp, setliveXrp] = useState(null);
  const [liveDoge, setliveDoge] = useState(null);
  const [liveSol, setliveSol] = useState(null);
  const [liveTon, setliveTon] = useState(null);
  const [liveLink, setliveLink] = useState(null);
  const [liveDot, setliveDot] = useState(null);
  const [liveNear, setliveNear] = useState(null);
  const [liveUsdc, setliveUsdc] = useState(null);
  const [liveTrx, setliveTrx] = useState(null);

  const getCoinPrice = (coinSymbol) => {
    switch (coinSymbol) {
      case "bnb":
        return liveBnb || 210.25;
      case "xrp":
        return liveXrp || 0.5086;
      case "doge":
        return liveDoge || 0.1163;
      case "eur":
      case "usd":
      case "chf":
      case "dkk":
        return 1;
      case "sol":
        return liveSol || 245.01;
      case "ton":
        return liveTon || 5.76;
      case "link":
        return liveLink || 12.52;
      case "dot":
        return liveDot || 4.76;
      case "near":
        return liveNear || 5.59;
      case "usdc":
        return liveUsdc || 0.99;
      case "trx":
        return liveTrx || 0.1531;
      default:
        return 0;
    }
  };

  const getCoins = async (data) => {
    try {
      const response = await getCoinsUserApi(data._id);
      if (!response.success) {
        toast.dismiss();
        toast.error(response.msg);
        return;
      }

      const coinData = response.getCoin;
      setUserData(coinData);
      setuserCoins(response);
      setnewUserCoins(coinData.additionalCoins);
      setliveBtc(parsePrice(response.btcPrice, 96075.25));
      setliveEth(parsePrice(response.ethPrice, 2640));
      setliveBnb(parsePrice(response.bnbPrice, 210.25));
      setliveXrp(parsePrice(response.xrpPrice, 0.5086));
      setliveDoge(parsePrice(response.dogePrice, 0.1163));
      setliveSol(parsePrice(response.solPrice, 245.01));
      setliveTon(parsePrice(response.tonPrice, 5.76));
      setliveLink(parsePrice(response.linkPrice, 12.52));
      setliveDot(parsePrice(response.dotPrice, 4.76));
      setliveNear(parsePrice(response.nearPrice, 5.59));
      setliveUsdc(parsePrice(response.usdcPrice, 0.99));
      setliveTrx(parsePrice(response.trxPrice, 0.1531));
      setbtcBalance(sumCompletedBalance(coinData.transactions, "bitcoin"));
      setethBalance(sumCompletedBalance(coinData.transactions, "ethereum"));
      setusdtBalance(sumCompletedBalance(coinData.transactions, "tether"));
      setisLoading(false);
    } catch (error) {
      toast.dismiss();
      toast.error(error);
    }
  };

  const getsignUser = async () => {
    try {
      const formData = new FormData();
      formData.append("id", authUser().user._id);
      const response = await getsignUserApi(formData);
      if (response.success) {
        setIsUser(response.signleUser);
      } else {
        toast.dismiss();
        toast.error(response.msg);
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error);
    }
  };

  const patchCoins = async () => {
    try {
      await patchCoinsApi(authUser().user._id);
    } catch (error) {
      toast.dismiss();
      toast.error(error);
    }
  };

  useEffect(() => {
    getsignUser();
    getCoins(authUser().user);
    patchCoins();
  }, []);

  const getFiatBalance = (fiatKey) => {
    const additionalCoins =
      newUserCoins || userCoins?.getCoin?.additionalCoins || UserData?.additionalCoins;
    const transactions = userCoins?.getCoin?.transactions || UserData?.transactions;
    return getFiatBalanceFromCoins(
      fiatKey,
      additionalCoins,
      transactions,
      getTransactionsForCoin
    );
  };

  const portfolioCoins = useMemo(
    () =>
      buildPortfolioCoins({
        UserData,
        newUserCoins,
        userCoins,
        btcBalance,
        ethBalance,
        usdtBalance,
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
        getTransactionsForCoin,
        getCoinPrice,
      }),
    [
      UserData,
      newUserCoins,
      userCoins,
      btcBalance,
      ethBalance,
      usdtBalance,
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
    ]
  );

  const withdraw = useAssetWithdraw({
    authUser,
    isUser,
    userCoins,
    userData: UserData,
    newUserCoins,
    btcBalance,
    ethBalance,
    usdtBalance,
    getCoinPrice,
    onSuccess: () => getCoins(authUser().user),
  });

  const handleRequestActivation = async (coin) => {
    try {
      setActivatingCoinTrx(coin.trxName);
      const response = await requestCoinActivationApi(authUser().user._id, {
        trxName: coin.trxName,
        coinSymbol: coin.symbol,
      });
      if (response.success) {
        toast.success(response.msg);
        getCoins(authUser().user);
      } else {
        toast.error(response.msg || "Unable to request activation");
      }
    } catch (error) {
      toast.error(error?.message || "Unable to request activation");
    } finally {
      setActivatingCoinTrx("");
    }
  };

  return (
    <>
      <div className={`card new-bg-dark price-list style-2 rounded border-style ${styles.card}`}>
        <div className="card-header border-0 pb-2 px-3 d-flex align-items-center justify-content-between">
          <h4 className="text-pink mb-0 card-title">Assets</h4>
          <Link
            to="/assets"
            className="sasa rounded-lg px-4 py-2 font-sans text-sm font-medium underline-offset-4 transition-colors duration-300 hover:underline"
          >
            View all
          </Link>
        </div>
        <div className="card-body p-3 pt-0">
          {isLoading ? (
            <p className="text-muted mb-0 py-3">Loading assets...</p>
          ) : !UserData ? (
            <p className="text-muted mb-0 py-3">No assets found</p>
          ) : (
            <div className={styles.embeddedOverview}>
              <AssetsOverview
                coins={portfolioCoins}
                isUser={isUser}
                assetsTab={assetsTab}
                setAssetsTab={setAssetsTab}
                getFiatBalance={getFiatBalance}
                onFiatWithdraw={withdraw.openFiatWithdraw}
                onCryptoWithdraw={withdraw.handleCoinWithdraw}
                onRequestActivation={handleRequestActivation}
                activatingCoinTrx={activatingCoinTrx}
                showCryptoWithdraw
              />
            </div>
          )}
        </div>
      </div>

      <AssetWithdrawModals
        {...withdraw}
        btcBalance={btcBalance}
        ethBalance={ethBalance}
        usdtBalance={usdtBalance}
        isUser={isUser}
        liveBtc={liveBtc}
        liveEth={liveEth}
      />
    </>
  );
};

export default DashboardAssetsWallets;
