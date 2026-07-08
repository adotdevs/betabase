import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuthUser } from "react-auth-kit";
import {
  createUserTransactionDepositSwapApi,
  createUserTransactionWithdrawSwapApi,
  getCoinsUserApi,
  getLinksApi,
  getsignUserApi,
} from "../../../Api/Service";
import { buildPortfolioCoins, getAdditionalCoinPrice } from "./assets/coinConfig";
import CoinPickerModal from "./swap/CoinPickerModal";
import styles from "./swap/Swap.module.css";
import {
  convertSwapAmount,
  findSwapCoin,
  formatFiatEstimate,
  formatSwapAmount,
  getSwapRate,
  getTransactionsForCoin,
  pickAlternateCoin,
} from "./swap/swapUtils";

const Swap = () => {
  const authUser = useAuthUser();
  const navigate = useNavigate();
  const location = useLocation();
  const userId = authUser()?.user?._id;

  const [linksReady, setLinksReady] = useState(false);
  const [swapEnabled, setSwapEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [walletSnapshot, setWalletSnapshot] = useState(null);

  const [fromCoin, setFromCoin] = useState(null);
  const [toCoin, setToCoin] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const [outputValue, setOutputValue] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pickerMode, setPickerMode] = useState(null);
  const [userCurrency, setUserCurrency] = useState("USD");

  useEffect(() => {
    const role = authUser()?.user?.role;
    if (role === "user") return;
    if (role === "admin") {
      navigate("/admin/dashboard");
    }
  }, [authUser, navigate]);

  useEffect(() => {
    let cancelled = false;

    const fetchLinks = async () => {
      try {
        const data = await getLinksApi();
        const enabled = Boolean(data?.links?.[7]?.enabled);
        if (!cancelled) {
          setSwapEnabled(enabled);
          if (!enabled) {
            toast.info("Swap is currently unavailable");
            navigate("/assets");
          }
        }
      } catch (error) {
        console.error("Error fetching links:", error);
        if (!cancelled) {
          setSwapEnabled(true);
        }
      } finally {
        if (!cancelled) {
          setLinksReady(true);
        }
      }
    };

    fetchLinks();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return undefined;
    }

    let cancelled = false;

    const loadWallet = async () => {
      setIsLoading(true);

      try {
        const formData = new FormData();
        formData.append("id", userId);

        const [userCoins, userProfile] = await Promise.all([
          getCoinsUserApi(userId),
          getsignUserApi(formData),
        ]);
        if (cancelled) return;

        if (userProfile?.success && userProfile.signleUser?.currency) {
          setUserCurrency(userProfile.signleUser.currency);
        }

        if (!userCoins?.success) {
          toast.error(userCoins?.msg || "Unable to load wallet");
          return;
        }

        const transactions = userCoins.getCoin?.transactions || [];
        const livePrices = {
          bnb: userCoins?.bnbPrice?.quote?.USD?.price ?? 210.25,
          xrp: userCoins?.xrpPrice?.quote?.USD?.price ?? 0.5086,
          doge: userCoins?.dogePrice?.quote?.USD?.price ?? 0.1163,
          sol: userCoins?.solPrice?.quote?.USD?.price ?? 245.01,
          ton: userCoins?.tonPrice?.quote?.USD?.price ?? 5.76,
          link: userCoins?.linkPrice?.quote?.USD?.price ?? 12.52,
          dot: userCoins?.dotPrice?.quote?.USD?.price ?? 4.76,
          near: userCoins?.nearPrice?.quote?.USD?.price ?? 5.59,
          usdc: userCoins?.usdcPrice?.quote?.USD?.price ?? 0.99,
          trx: userCoins?.trxPrice?.quote?.USD?.price ?? 0.1531,
        };

        setWalletSnapshot({
          userData: userCoins.getCoin,
          additionalCoins: userCoins.getCoin?.additionalCoins || [],
          transactions,
          liveBtc: userCoins?.btcPrice?.quote?.USD?.price ?? 96075.25,
          liveEth: userCoins?.ethPrice?.quote?.USD?.price ?? 2640,
          livePrices,
          btcBalance: getTransactionsForCoin("bitcoin", transactions),
          ethBalance: getTransactionsForCoin("ethereum", transactions),
          usdtBalance: getTransactionsForCoin("tether", transactions),
        });
      } catch (error) {
        if (!cancelled) {
          toast.error(error?.message || "Unable to load wallet");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadWallet();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const swapCoins = useMemo(() => {
    if (!walletSnapshot) return [];

    return buildPortfolioCoins({
      UserData: walletSnapshot.userData,
      newUserCoins: walletSnapshot.additionalCoins,
      userCoins: { getCoin: walletSnapshot.userData },
      btcBalance: walletSnapshot.btcBalance,
      ethBalance: walletSnapshot.ethBalance,
      usdtBalance: walletSnapshot.usdtBalance,
      liveBtc: walletSnapshot.liveBtc,
      liveEth: walletSnapshot.liveEth,
      liveBnb: walletSnapshot.livePrices.bnb,
      liveXrp: walletSnapshot.livePrices.xrp,
      liveDoge: walletSnapshot.livePrices.doge,
      liveSol: walletSnapshot.livePrices.sol,
      liveTon: walletSnapshot.livePrices.ton,
      liveLink: walletSnapshot.livePrices.link,
      liveDot: walletSnapshot.livePrices.dot,
      liveNear: walletSnapshot.livePrices.near,
      liveUsdc: walletSnapshot.livePrices.usdc,
      liveTrx: walletSnapshot.livePrices.trx,
      getTransactionsForCoin,
      getCoinPrice: (symbol) => getAdditionalCoinPrice(symbol, walletSnapshot.livePrices),
    }).filter((coin) => coin.trxName !== "euro");
  }, [walletSnapshot]);

  useEffect(() => {
    if (!swapCoins.length || fromCoin) return;

    const routeCoin = findSwapCoin(swapCoins, {
      symbol: location.state?.fromCoin,
      trxName: location.state?.fromTrxName,
      slug: location.state?.fromSlug,
    });

    const defaultFrom =
      routeCoin ||
      findSwapCoin(swapCoins, { symbol: "USDT" }) ||
      swapCoins[0];

    const defaultTo =
      pickAlternateCoin(swapCoins, defaultFrom.trxName) ||
      findSwapCoin(swapCoins, { symbol: "BTC" }) ||
      swapCoins[1] ||
      swapCoins[0];

    setFromCoin(defaultFrom);
    setToCoin(defaultTo);
  }, [swapCoins, fromCoin, location.state]);

  const recalculateOutput = useCallback(
    (amount, nextFromCoin, nextToCoin) => {
      if (!nextFromCoin || !nextToCoin) {
        setOutputValue("");
        return;
      }

      const converted = convertSwapAmount(amount, nextFromCoin, nextToCoin);
      setOutputValue(converted ? formatSwapAmount(converted, 8) : "");
    },
    []
  );

  useEffect(() => {
    if (!inputValue || !fromCoin || !toCoin) {
      setOutputValue("");
      return undefined;
    }

    setIsCalculating(true);
    const timer = window.setTimeout(() => {
      recalculateOutput(inputValue, fromCoin, toCoin);
      setIsCalculating(false);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [inputValue, fromCoin, toCoin, recalculateOutput]);

  const handleInputChange = (event) => {
    const rawValue = event.target.value;
    if (rawValue !== "" && !/^\d*\.?\d*$/.test(rawValue)) return;

    const maxBalance = Number(fromCoin?.balance || 0);
    let nextValue = rawValue;

    if (rawValue && parseFloat(rawValue) > maxBalance) {
      nextValue = formatSwapAmount(maxBalance, 8);
    }

    setInputValue(nextValue);
  };

  const handleMaxClick = () => {
    if (!fromCoin) return;
    const maxValue = formatSwapAmount(fromCoin.balance || 0, 8);
    setInputValue(maxValue);
  };

  const handlePickCoin = (mode, coin) => {
    if (mode === "from") {
      setFromCoin(coin);
      if (coin.trxName === toCoin?.trxName) {
        setToCoin(pickAlternateCoin(swapCoins, coin.trxName));
      }
    } else {
      setToCoin(coin);
      if (coin.trxName === fromCoin?.trxName) {
        setFromCoin(pickAlternateCoin(swapCoins, coin.trxName));
      }
    }

    setInputValue("");
    setOutputValue("");
    setPickerMode(null);
  };

  const handleFlip = () => {
    if (!fromCoin || !toCoin) return;
    const nextFrom = toCoin;
    const nextTo = fromCoin;
    setFromCoin(nextFrom);
    setToCoin(nextTo);

    if (inputValue) {
      recalculateOutput(inputValue, nextFrom, nextTo);
    }
  };

  const expectedRate = useMemo(() => {
    if (!fromCoin || !toCoin) return "0";
    return formatSwapAmount(getSwapRate(fromCoin, toCoin), 8);
  }, [fromCoin, toCoin]);

  const canSwap =
    fromCoin &&
    toCoin &&
    fromCoin.trxName !== toCoin.trxName &&
    parseFloat(inputValue) > 0 &&
    outputValue &&
    !isCalculating &&
    !isSubmitting;

  const postUserTransaction = async () => {
    if (!canSwap) return;

    setIsSubmitting(true);

    try {
      const id = userId;
      const bodyWithdraw = {
        trxName: fromCoin.trxName,
        amount: -parseFloat(inputValue),
        txId: "placeholder",
        fromAddress: "placeholder",
        status: "completed",
        type: "withdraw",
        isHidden: true,
      };
      const bodyDeposit = {
        trxName: toCoin.trxName,
        amount: parseFloat(outputValue),
        txId: "placeholder",
        fromAddress: "placeholder",
        status: "completed",
        type: "deposit",
        isHidden: true,
      };

      const [withdrawResult, depositResult] = await Promise.all([
        createUserTransactionWithdrawSwapApi(id, bodyWithdraw),
        createUserTransactionDepositSwapApi(id, bodyDeposit),
      ]);

      if (depositResult.success) {
        toast.success(depositResult.msg);
        navigate("/assets");
      } else {
        toast.error(withdrawResult?.msg || depositResult?.msg || "Swap failed");
      }
    } catch (error) {
      toast.error(error?.message || "Swap failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!linksReady || isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} />
          <span>Loading swap...</span>
        </div>
      </div>
    );
  }

  if (!swapEnabled) {
    return null;
  }

  if (!fromCoin || !toCoin) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyWrap}>
          <span>No swappable coins found in your wallet.</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.page}>
        <button type="button" className={styles.backBtn} onClick={() => navigate("/assets")}>
          ← Back to assets
        </button>

        <div className={styles.pageHeader}>
          <h1>Swap</h1>
          <p>Exchange any asset in your wallet instantly at live rates.</p>
        </div>

        <section className={styles.panel}>
          <div className={styles.panelInner}>
            <div className={styles.swapBlock}>
              <div className={styles.blockHeader}>
                <span className={styles.blockLabel}>From</span>
                <div className={styles.balanceRow}>
                  <span className={styles.balanceLabel}>Balance</span>
                  <span className={styles.balanceValue}>
                    {formatSwapAmount(fromCoin.balance || 0, 5)} {fromCoin.symbol}
                  </span>
                  <button type="button" className={styles.maxBtn} onClick={handleMaxClick}>
                    Max
                  </button>
                </div>
              </div>

              <div className={styles.blockBody}>
                <button
                  type="button"
                  className={styles.coinBtn}
                  onClick={() => setPickerMode("from")}
                >
                  <span className={styles.coinIcon}>
                    {fromCoin.logo ? (
                      <img src={fromCoin.logo} alt={fromCoin.name} />
                    ) : (
                      <span>{fromCoin.symbol?.slice(0, 1)}</span>
                    )}
                  </span>
                  <span className={styles.coinMeta}>
                    <strong>{fromCoin.name}</strong>
                    <small>{fromCoin.symbol}</small>
                  </span>
                  <span className={styles.chevron} aria-hidden="true">›</span>
                </button>

                <div className={styles.amountCol}>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={styles.amountInput}
                    placeholder="0"
                    value={inputValue}
                    onChange={handleInputChange}
                  />
                  <span className={styles.fiatEstimate}>
                    {formatFiatEstimate(inputValue, fromCoin.price, userCurrency)}
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.flipRow}>
              <button type="button" className={styles.flipBtn} onClick={handleFlip} aria-label="Swap direction">
                ⇄
              </button>
            </div>

            <div className={styles.swapBlock}>
              <div className={styles.blockHeader}>
                <span className={styles.blockLabel}>To</span>
                <div className={styles.balanceRow}>
                  <span className={styles.balanceLabel}>Balance</span>
                  <span className={styles.balanceValue}>
                    {formatSwapAmount(toCoin.balance || 0, 5)} {toCoin.symbol}
                  </span>
                </div>
              </div>

              <div className={styles.blockBody}>
                <button
                  type="button"
                  className={styles.coinBtn}
                  onClick={() => setPickerMode("to")}
                >
                  <span className={styles.coinIcon}>
                    {toCoin.logo ? (
                      <img src={toCoin.logo} alt={toCoin.name} />
                    ) : (
                      <span>{toCoin.symbol?.slice(0, 1)}</span>
                    )}
                  </span>
                  <span className={styles.coinMeta}>
                    <strong>{toCoin.name}</strong>
                    <small>{toCoin.symbol}</small>
                  </span>
                  <span className={styles.chevron} aria-hidden="true">›</span>
                </button>

                <div className={styles.amountCol}>
                  <input
                    type="text"
                    className={styles.amountInput}
                    placeholder="0"
                    value={isCalculating ? "" : outputValue}
                    readOnly
                  />
                  <span className={styles.fiatEstimate}>
                    {formatFiatEstimate(outputValue, toCoin.price, userCurrency)}
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.rateBar}>
              <span>
                Rate: <strong>1 {fromCoin.symbol} ≈ {expectedRate} {toCoin.symbol}</strong>
              </span>
              <span className={styles.rateBadge}>No extra fees</span>
            </div>

            <button
              type="button"
              className={styles.swapBtn}
              disabled={!canSwap}
              onClick={postUserTransaction}
            >
              {isSubmitting ? "Swapping..." : `Swap ${fromCoin.symbol} for ${toCoin.symbol}`}
            </button>
          </div>
        </section>
      </div>

      <CoinPickerModal
        open={pickerMode === "from"}
        title="Select coin to swap from"
        coins={swapCoins}
        selectedTrxName={fromCoin.trxName}
        onSelect={(coin) => handlePickCoin("from", coin)}
        onClose={() => setPickerMode(null)}
      />

      <CoinPickerModal
        open={pickerMode === "to"}
        title="Select coin to swap to"
        coins={swapCoins.filter((coin) => coin.trxName !== fromCoin.trxName)}
        selectedTrxName={toCoin.trxName}
        onSelect={(coin) => handlePickCoin("to", coin)}
        onClose={() => setPickerMode(null)}
      />
    </>
  );
};

export default Swap;
