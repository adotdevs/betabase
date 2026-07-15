import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  createUserTransactionApi,
  getRestrictionsApi,
  sendEmailCodeApi,
} from "../../../../Api/Service";
import {
  getFiatCurrencyByKey,
  isFiatCoin,
} from "../../../../utils/euroCoinUtils";
import { getTransactionsForCoin } from "./coinConfig";

export function useAssetWithdraw({
  authUser,
  isUser,
  userCoins,
  userData,
  newUserCoins,
  btcBalance,
  ethBalance,
  usdtBalance,
  getCoinPrice,
  onSuccess,
}) {
  const [modal3, setModal3] = useState(false);
  const [otpModal, setotpModal] = useState(false);
  const [depositName, setdepositName] = useState("");
  const [transactionDetail, settransactionDetail] = useState({ amountMinus: "" });
  const [transactionDetailId, settransactionDetailId] = useState({ txId: "" });
  const [NewValue, setNewValue] = useState("");
  const [newCoin, setnewCoin] = useState({});
  const [activeBank, setactiveBank] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [isDisable, setisDisable] = useState(false);
  const [isUserRestriction, setIsUserRestriction] = useState(false);
  const [isError, setIsError] = useState({ show: false, type: "" });
  const [randomCode, setRandomCode] = useState(null);
  const [isDisable2, setisDisable2] = useState(false);
  const [otp, setOtp] = useState("");
  const [counter, setCounter] = useState(0);
  const [counterDisable, setCounterDisable] = useState(false);

  const getUserRestrcition = async () => {
    try {
      const data = await getRestrictionsApi();
      if (data.success) {
        setIsUserRestriction(data.data.withdrawal2Fa);
      } else {
        toast.dismiss();
        toast.error(data.msg);
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error);
    }
  };

  useEffect(() => {
    getUserRestrcition();
  }, []);

  useEffect(() => {
    if (counter === 0) return;
    const interval = setInterval(() => {
      setCounter((prev) => {
        if (prev <= 1) {
          setCounterDisable(false);
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [counter]);

  const closeDeposit = () => {
    setdepositName("");
    settransactionDetail({ amountMinus: "" });
    setnewCoin({});
    setNewValue("");
    settransactionDetailId({ txId: "" });
    setModal3(false);
    setotpModal(false);
    setactiveBank(false);
    setSelectedPayment(null);
    setOtp("");
    setIsError({ show: false, type: "" });
  };

  const activeCrypto = () => setactiveBank(false);
  const activeBankOne = () => setactiveBank(true);

  const handlePaymentSelection = (event) => {
    const selectedValue = event.target.value;
    if (selectedValue === "Select a Payment Method") {
      setSelectedPayment(null);
    } else {
      setSelectedPayment(selectedValue);
    }
  };

  const handleTransactionId = (e) => {
    const { name, value } = e.target;
    settransactionDetailId({ ...transactionDetailId, [name]: value });
  };

  const handleTransaction = (e) => {
    const { name, value } = e.target;
    let depositBalance;

    if (depositName === "bitcoin") {
      depositBalance = btcBalance.toFixed(8);
    } else if (depositName === "ethereum") {
      depositBalance = ethBalance.toFixed(8);
    } else if (depositName === "tether") {
      depositBalance = usdtBalance.toFixed(8);
    } else if (isFiatCoin(depositName) || [
      "bnb", "xrp", "dogecoin", "solana", "toncoin", "chainlink",
      "polkadot", "near protocol", "usd coin", "tron",
    ].includes(depositName)) {
      depositBalance = NewValue;
    } else {
      depositBalance = 0;
    }

    const sanitizedValue = value.replace(/[^0-9.]/g, "").slice(0, 9);
    const enteredValue = parseFloat(sanitizedValue);
    const maxBalance = parseFloat(depositBalance);

    if (!isNaN(enteredValue) && enteredValue <= maxBalance) {
      settransactionDetail({ ...transactionDetail, [name]: sanitizedValue });
    } else if (sanitizedValue === "") {
      settransactionDetail({ ...transactionDetail, [name]: "" });
    } else {
      settransactionDetail({ ...transactionDetail, [name]: depositBalance });
    }
  };

  const NewCoinDepositMinus = (coin) => {
    const transactions = userCoins?.getCoin?.transactions || userData?.transactions;
    if (!transactions) {
      toast.error("Unable to load balance");
      return;
    }
    const totalBalance = getTransactionsForCoin(coin.coinName, transactions);
    setNewValue(totalBalance.toFixed(8));
    setnewCoin(coin);
    setdepositName(String(coin.coinName || "").toLowerCase());
    setModal3(true);
  };

  const openFiatWithdraw = (fiatKey) => {
    const fiat = getFiatCurrencyByKey(fiatKey);
    const additionalCoins =
      newUserCoins || userCoins?.getCoin?.additionalCoins || userData?.additionalCoins;
    const fiatCoin = additionalCoins?.find(
      (coin) => String(coin.coinName || "").toLowerCase() === fiat?.key
    );
    if (!fiatCoin) {
      toast.error(`${fiat?.coinName || "Fiat"} wallet not found`);
      return;
    }
    NewCoinDepositMinus(fiatCoin);
  };

  const btcDepositMinus = () => {
    setdepositName("bitcoin");
    setModal3(true);
  };
  const ethDepositMinus = () => {
    setdepositName("ethereum");
    setModal3(true);
  };
  const tetherDepositMinus = () => {
    setdepositName("tether");
    setModal3(true);
  };

  const handleCoinWithdraw = (coin) => {
    if (coin.trxName === "bitcoin") {
      btcDepositMinus();
      return;
    }
    if (coin.trxName === "ethereum") {
      ethDepositMinus();
      return;
    }
    if (coin.trxName === "tether") {
      tetherDepositMinus();
      return;
    }
    if (coin.isAdditional && coin.coinData) {
      NewCoinDepositMinus(coin.coinData);
    }
  };

  function generateRandomCode() {
    return Math.floor(Math.random() * 900000) + 100000;
  }

  const formatWithdrawalAmount = () => {
    const amount = transactionDetail.amountMinus;
    if (amount === "" || amount === null || amount === undefined) return "";
    if (isFiatCoin(depositName)) {
      const fiat = getFiatCurrencyByKey(depositName);
      return `${Number(amount).toFixed(2)} ${fiat?.label || "EUR"}`;
    }
    if (depositName === "bitcoin") return `${amount} BTC`;
    if (depositName === "ethereum") return `${amount} ETH`;
    if (depositName === "tether") return `${amount} USDT`;
    if (newCoin?.coinSymbol) {
      return `${amount} ${String(newCoin.coinSymbol).toUpperCase()}`;
    }
    return String(amount);
  };

  const sendEmail = async () => {
    setisDisable(true);
    const newCode = generateRandomCode();
    try {
      const id = authUser().user._id;
      const email = authUser().user.email;
      const username = authUser().user.firstName;
      const body = { email, id, code: newCode, username, amount: formatWithdrawalAmount() };
      const response = await sendEmailCodeApi(body);
      if (response.success) {
        toast.dismiss();
        setModal3(false);
        setotpModal(true);
        setRandomCode(newCode);
        toast.success(response.msg);
      } else {
        toast.dismiss();
        toast.error(response.msg);
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error?.data?.msg || error?.message || "Something went wrong");
    } finally {
      setisDisable(false);
    }
  };

  const setMaxWithdrawAmount = (amount) => {
    settransactionDetail({ amountMinus: amount });
  };

  const postUserTransaction = async (e, isSendOtp) => {
    if (
      parseFloat(transactionDetail.amountMinus) <= 0 ||
      transactionDetail.amountMinus === "00" ||
      transactionDetail.amountMinus === "0.000"
    ) {
      toast.dismiss();
      toast.error(
        "Transaction amount must be a positive value and cannot be equal to zero"
      );
      return;
    }

    let body;
    if (e === "crypto") {
      body = {
        trxName: depositName,
        amount: -transactionDetail.amountMinus,
        txId: transactionDetailId.txId,
        e,
        notification: true,
      };
      if (!body.trxName || !body.amount || !body.txId) {
        toast.dismiss();
        toast.error("Fill all the required fields");
        return;
      }
      try {
        const id = authUser().user._id;
        setisDisable(true);
        if (isUserRestriction === true && isSendOtp) {
          sendEmail();
          return;
        }
        const newTransaction = await createUserTransactionApi(id, body);
        if (newTransaction.success) {
          getUserRestrcition();
          setSelectedPayment(null);
          toast.dismiss();
          setisDisable(false);
          toast.success(newTransaction.msg);
          closeDeposit();
          onSuccess?.();
        } else {
          closeDeposit();
          getUserRestrcition();
          setisDisable(false);
          toast.dismiss();
          toast.error(newTransaction.msg);
        }
      } catch (error) {
        closeDeposit();
        getUserRestrcition();
        toast.dismiss();
        setisDisable(false);
        toast.error(error);
      }
    } else if (e === "bank") {
      body = {
        trxName: depositName,
        amount: -transactionDetail.amountMinus,
        selectedPayment,
        e,
        notification: true,
      };
      if (!body.trxName || !body.amount) {
        toast.dismiss();
        toast.error("Fill all the required fields");
        return;
      }
      if (selectedPayment === null) {
        toast.dismiss();
        toast.error("Please select a Payment Method");
        return;
      }
      try {
        setisDisable(true);
        const id = authUser().user._id;
        if (isUserRestriction === true && isSendOtp) {
          sendEmail();
          return;
        }
        const newTransaction = await createUserTransactionApi(id, body);
        if (newTransaction.success) {
          getUserRestrcition();
          setSelectedPayment(null);
          toast.dismiss();
          setisDisable(false);
          toast.success(newTransaction.msg);
          closeDeposit();
          onSuccess?.();
        } else {
          closeDeposit();
          getUserRestrcition();
          setisDisable(false);
          toast.dismiss();
          toast.error(newTransaction.msg);
        }
      } catch (error) {
        closeDeposit();
        toast.dismiss();
        setisDisable(false);
        getUserRestrcition();
        toast.error(error);
      }
    }
  };

  const verifyOtp = (e) => {
    setisDisable(true);
    if (Number(randomCode) === Number(otp)) {
      postUserTransaction(e, false);
      return;
    }
    setTimeout(() => {
      setIsError({
        show: true,
        type: "The OTP you entered is incorrect. Please try again.",
      });
      setisDisable(false);
    }, 2000);
  };

  const reSend = async () => {
    const newCode = generateRandomCode();
    try {
      const id = authUser().user._id;
      const email = authUser().user.email;
      const username = authUser().user.firstName;
      const body = { email, id, code: newCode, username, amount: formatWithdrawalAmount() };
      setisDisable2(true);
      const response = await sendEmailCodeApi(body);
      if (response.success) {
        setCounter(60);
        setRandomCode(newCode);
        setCounterDisable(true);
        toast.dismiss();
      } else {
        setisDisable2(false);
        toast.dismiss();
        toast.error(response.msg);
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error?.data?.msg || error?.message || "Something went wrong");
    } finally {
      setisDisable2(false);
    }
  };

  return {
    modal3,
    otpModal,
    depositName,
    transactionDetail,
    transactionDetailId,
    NewValue,
    newCoin,
    activeBank,
    selectedPayment,
    isDisable,
    isDisable2,
    isError,
    otp,
    counter,
    counterDisable,
    closeDeposit,
    activeCrypto,
    activeBankOne,
    handlePaymentSelection,
    handleTransactionId,
    handleTransaction,
    openFiatWithdraw,
    handleCoinWithdraw,
    postUserTransaction,
    verifyOtp,
    reSend,
    setOtp,
    setIsError,
    setMaxWithdrawAmount,
    getCoinPrice,
  };
}
