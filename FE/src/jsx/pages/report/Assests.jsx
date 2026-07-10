import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuthUser } from 'react-auth-kit';
import { createUserTransactionApi, getCoinsUserApi, getRestrictionsApi, getsignUserApi, patchCoinsApi, requestCoinActivationApi, sendEmailCodeApi } from '../../../Api/Service';
import { Button, Col, Form, DropdownDivider, InputGroup, Modal, Row } from 'react-bootstrap';
import './style.css'
import styles from './Assests.module.css';
import AssetsOverview from './assets/AssetsOverview';
import CoinDetail from './assets/CoinDetail';
import { buildPortfolioCoins, findCoinBySlug, getTransactionsForCoin } from './assets/coinConfig';

const getCoinPrice = (coinSymbol, livePrices = {}) => {
    switch (coinSymbol) {
        case "bnb": return livePrices.bnb || 210.25;
        case "xrp": return livePrices.xrp || 0.5086;
        case "doge": return livePrices.doge || 0.1163;
        case "eur": return 1;
        case "sol": return livePrices.sol || 245.01;
        case "ton": return livePrices.ton || 5.76;
        case "link": return livePrices.link || 12.52;
        case "dot": return livePrices.dot || 4.76;
        case "near": return livePrices.near || 5.59;
        case "usdc": return livePrices.usdc || 0.99;
        case "trx": return livePrices.trx || 0.1531;
        default: return 0; // Unknown coin price
    }
};
const Orders = () => {
    const [userCoins, setuserCoins] = useState('');

    const [Active, setActive] = useState(false);
    const [isLoading, setisLoading] = useState(true);
    const [assetsTab, setAssetsTab] = useState('crypto');
    const [btcBalance, setbtcBalance] = useState(0);
    const [isDisable, setisDisable] = useState(false);
    const [newUserCoins, setnewUserCoins] = useState(null);

    const [confirmationPopup, setConfirmationPopup] = useState(false);
    const [newCoin, setnewCoin] = useState({});
    const [UserData, setUserData] = useState(true);
    const [fractionBalance, setfractionBalance] = useState("00");
    const [ethBalance, setethBalance] = useState(0);
    const [usdtBalance, setusdtBalance] = useState(0);
    let toggleBar = () => {
        if (Active === true) {
            setActive(false);
        } else {
            setActive(true);
        }
    };

    const patchCoins = async () => {
        try {
            const userCoins = await patchCoinsApi(authUser().user._id);

            if (userCoins.success) {

            } else {
                toast.dismiss();
                toast.error(userCoins.msg);
            }
        } catch (error) {
            toast.dismiss();
            toast.error(error);
        } finally {
        }
    };

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

    const authUser = useAuthUser();
    const Navigate = useNavigate();
    const location = useLocation();
    const { coinSlug } = useParams();
    const [pendingEuroWithdraw, setPendingEuroWithdraw] = useState(false);
    const [activatingCoinTrx, setActivatingCoinTrx] = useState("");
    const [isUser, setIsUser] = useState({});
    const [isUserRestriction, setIsUserRestriction] = useState(false);
    const getUserRestrcition = async () => {
        try {
            const data = await getRestrictionsApi();

            if (data.success) {
                setIsUserRestriction(data.data.withdrawal2Fa);
                return;
            } else {
                toast.dismiss();
                toast.error(data.msg);
            }
        } catch (error) {
            toast.dismiss();
            toast.error(error);
        } finally {
        }
    };
    useEffect(() => {

        getUserRestrcition()
    }, []);
    const getsignUser = async () => {
        try {
            const formData = new FormData();
            formData.append("id", authUser().user._id);
            const userCoins = await getsignUserApi(formData);

            if (userCoins.success) {
                setIsUser(userCoins.signleUser);

                return;
            } else {
                toast.dismiss();
                toast.error(userCoins.msg);
            }
        } catch (error) {
            toast.dismiss();
            toast.error(error);
        } finally {
        }
    };
    //
    const getCoins = async (data) => {
        let id = data._id;
        try {
            // const response = await axios.get(
            //     "https://api.coindesk.com/v1/bpi/currentprice.json"
            // );
            const userCoins = await getCoinsUserApi(id);

            if (userCoins.success) {
                setUserData(userCoins.getCoin);
                // setUserTransactions;
                let val = 0;
                if (userCoins && userCoins.btcPrice && userCoins.btcPrice.quote && userCoins.btcPrice.quote.USD) {

                    val = userCoins.btcPrice.quote.USD.price
                } else {
                    val = 96075.25
                }
                
                console.log("allTransactions.ethPrice.quote.USD.price",userCoins)
                setliveBtc(val);
                let ethVal = 0;
                if (userCoins && userCoins.ethPrice && userCoins.ethPrice.quote && userCoins.ethPrice.quote.USD) {
                    ethVal = userCoins.ethPrice.quote.USD.price
                } else {
                    ethVal = 2640
                }
                setliveEth(ethVal);
                let bnbVal = 0;
                if (userCoins && userCoins.bnbPrice && userCoins.bnbPrice.quote && userCoins.bnbPrice.quote.USD) {
                    bnbVal = userCoins.bnbPrice.quote.USD.price
                } else {
                    bnbVal = 210.25
                }
                setliveBnb(bnbVal);
                let xrpVal = 0;
                if (userCoins && userCoins.xrpPrice && userCoins.xrpPrice.quote && userCoins.xrpPrice.quote.USD) {
                    xrpVal = userCoins.xrpPrice.quote.USD.price
                } else {
                    xrpVal = 0.5086
                }
                setliveXrp(xrpVal);
                let dogeVal = 0;
                if (userCoins && userCoins.dogePrice && userCoins.dogePrice.quote && userCoins.dogePrice.quote.USD) {
                    dogeVal = userCoins.dogePrice.quote.USD.price
                } else {
                    dogeVal = 0.1163
                }
                setliveDoge(dogeVal);
                let solVal = 0;
                if (userCoins && userCoins.solPrice && userCoins.solPrice.quote && userCoins.solPrice.quote.USD) {
                    solVal = userCoins.solPrice.quote.USD.price
                } else {
                    solVal = 245.01
                }
                setliveSol(solVal);
                let tonVal = 0;
                if (userCoins && userCoins.tonPrice && userCoins.tonPrice.quote && userCoins.tonPrice.quote.USD) {
                    tonVal = userCoins.tonPrice.quote.USD.price
                } else {
                    tonVal = 5.76
                }
                setliveTon(tonVal);
                let linkVal = 0;
                if (userCoins && userCoins.linkPrice && userCoins.linkPrice.quote && userCoins.linkPrice.quote.USD) {
                    linkVal = userCoins.linkPrice.quote.USD.price
                } else {
                    linkVal = 12.52
                }
                setliveLink(linkVal);
                let dotVal = 0;
                if (userCoins && userCoins.dotPrice && userCoins.dotPrice.quote && userCoins.dotPrice.quote.USD) {
                    dotVal = userCoins.dotPrice.quote.USD.price
                } else {
                    dotVal = 4.76
                }
                setliveDot(dotVal);
                let nearVal = 0;
                if (userCoins && userCoins.nearPrice && userCoins.nearPrice.quote && userCoins.nearPrice.quote.USD) {
                    nearVal = userCoins.nearPrice.quote.USD.price
                } else {
                    nearVal = 5.59
                }
                setliveNear(nearVal);
                let usdcVal = 0;
                if (userCoins && userCoins.usdcPrice && userCoins.usdcPrice.quote && userCoins.usdcPrice.quote.USD) {
                    usdcVal = userCoins.usdcPrice.quote.USD.price
                } else {
                    usdcVal = 0.99
                }
                setliveUsdc(usdcVal);
                let trxVal = 0;
                if (userCoins && userCoins.trxPrice && userCoins.trxPrice.quote && userCoins.trxPrice.quote.USD) {
                    trxVal = userCoins.trxPrice.quote.USD.price
                } else {
                    trxVal = 0.1531
                }
                setliveTrx(trxVal);
                setisLoading(false);
                // tx

                setuserCoins(userCoins)
                setnewUserCoins(userCoins.getCoin.additionalCoins)
                const btc = userCoins.getCoin.transactions.filter((transaction) =>
                    transaction.trxName.includes("bitcoin")
                );
                const btccomplete = btc.filter((transaction) =>
                    transaction.status.includes("completed")
                );
                let btcCount = 0;
                let btcValueAdded = 0;
                for (let i = 0; i < btccomplete.length; i++) {
                    const element = btccomplete[i];
                    btcCount = element.amount;
                    btcValueAdded += btcCount;
                }
                setbtcBalance(btcValueAdded);
                // tx
                // tx
                const eth = userCoins.getCoin.transactions.filter((transaction) =>
                    transaction.trxName.includes("ethereum")
                );
                const ethcomplete = eth.filter((transaction) =>
                    transaction.status.includes("completed")
                );
                let ethCount = 0;
                let ethValueAdded = 0;
                for (let i = 0; i < ethcomplete.length; i++) {
                    const element = ethcomplete[i];
                    ethCount = element.amount;
                    ethValueAdded += ethCount;
                }
                setethBalance(ethValueAdded);
                // tx
                // tx
                const usdt = userCoins.getCoin.transactions.filter((transaction) =>
                    transaction.trxName.includes("tether")
                );
                const usdtcomplete = usdt.filter((transaction) =>
                    transaction.status.includes("completed")
                );
                let usdtCount = 0;
                let usdtValueAdded = 0;
                for (let i = 0; i < usdtcomplete.length; i++) {
                    const element = usdtcomplete[i];
                    usdtCount = element.amount;
                    usdtValueAdded += usdtCount;
                }
                setusdtBalance(usdtValueAdded);
                // tx

                const totalValue = (
                    btcValueAdded * liveBtc +
                    ethValueAdded * (liveEth || 2640) +
                    usdtValueAdded
                ).toFixed(2);

                //
                const [integerPart, fractionalPart] = totalValue.split(".");

                const formattedTotalValue = parseFloat(integerPart).toLocaleString(
                    "en-US",
                    {
                        style: "currency",
                        currency: "USD",
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                    }
                );

                //
                setfractionBalance(fractionalPart);
                return;
            } else {
                toast.dismiss();
                toast.error(userCoins.msg);
            }
        } catch (error) {
            toast.dismiss();
            toast.error(error);
        } finally {
        }
    };
    //
    const getCoinPrice = (coinSymbol) => {
        switch (coinSymbol) {
            case "bnb": return liveBnb || 210.25;
            case "xrp": return liveXrp || 0.5086;
            case "doge": return liveDoge || 0.1163;
            case "eur": return 1;
            case "sol": return liveSol || 245.01;
            case "ton": return liveTon || 5.76;
            case "link": return liveLink || 12.52;
            case "dot": return liveDot || 4.76;
            case "near": return liveNear || 5.59;
            case "usdc": return liveUsdc || 0.99;
            case "trx": return liveTrx || 0.1531;
            default: return 0; // Unknown coin price
        }
    };
    const getEuroCryptoBalance = () => {
        const additionalCoins = newUserCoins || userCoins?.getCoin?.additionalCoins;
        const transactions = userCoins?.getCoin?.transactions;
        if (!additionalCoins?.length || !transactions) return 0;
        const euroCoin = additionalCoins.find(
            (coin) => String(coin.coinName || '').toLowerCase() === 'euro'
        );
        if (!euroCoin) return 0;
        return getTransactionsForCoin('euro', transactions);
    };
    const [selectedPayment, setSelectedPayment] = useState(null); // State to store the selected payment method

    // Function to handle selection change in the dropdown menu
    const handlePaymentSelection = (event) => {
        const selectedValue = event.target.value;
        if (selectedValue === "Select a Payment Method") {
            setSelectedPayment(null); // Set selected payment to null if the first option is selected
        } else {
            setSelectedPayment(selectedValue); // Otherwise, update the selected payment state with the value of the selected option
        }
    };

    useEffect(() => {
        getsignUser();
        if (authUser().user.role === "user") {
            getCoins(authUser().user);
            patchCoins()
            return;
        } else if (authUser().user.role === "admin") {
            Navigate("/admin/dashboard");
            return;
        }
    }, [location.pathname]);
    // withdraw
    const [modal3, setModal3] = useState(false);
    const [otpModal, setotpModal] = useState(false);

    const [depositName, setdepositName] = useState("");

    const [transactionDetail, settransactionDetail] = useState({
        amountMinus: "",
        txId: "",
    });
    const [transactionDetailId, settransactionDetailId] = useState({
        amountMinus: "",
        txId: "",
    });
    let handleTransactionId = (e) => {
        let name = e.target.name;
        let value = e.target.value;
        settransactionDetailId({ ...transactionDetailId, [name]: value });
    };
    let handleTransaction = (e) => {
        let name = e.target.name;
        let value = e.target.value;

        // Assuming depositBalance is a state variable representing the available balance for the selected deposit type
        let depositBalance;

        // Check for each coin's balance
        if (depositName === "bitcoin") {
            depositBalance = btcBalance.toFixed(8);
        } else if (depositName === "ethereum") {
            depositBalance = ethBalance.toFixed(8);
        } else if (depositName === "tether") {
            depositBalance = usdtBalance.toFixed(8);
        } else if (depositName === "bnb") { // BNB
            depositBalance = NewValue;
        } else if (depositName === "xrp") { // XRP
            depositBalance = NewValue;
        } else if (depositName === "dogecoin") { // Dogecoin
            depositBalance = NewValue;
        } else if (depositName === "euro") { // Dogecoin
            depositBalance = NewValue;
        } else if (depositName === "solana") { // Dogecoin
            depositBalance = NewValue;
        } else if (depositName === "toncoin") { // Toncoin
            depositBalance = NewValue;
        } else if (depositName === "chainlink") { // Chainlink
            depositBalance = NewValue;
        } else if (depositName === "polkadot") { // Polkadot
            depositBalance = NewValue;
        } else if (depositName === "near protocol") { // Near Protocol
            depositBalance = NewValue;
        } else if (depositName === "usd coin") { // USD Coin
            depositBalance = NewValue;
        } else if (depositName === "tron") { // Tron
            depositBalance = NewValue;
        } else {
            depositBalance = 0
        }

        // Allow only up to 9 digits
        const sanitizedValue = value.replace(/[^0-9.]/g, "").slice(0, 9);

        // Parse values to float for comparison
        const enteredValue = parseFloat(sanitizedValue);
        const maxBalance = parseFloat(depositBalance);

        // Check if enteredValue is less than or equal to depositBalance
        if (!isNaN(enteredValue) && enteredValue <= maxBalance) {
            settransactionDetail({ ...transactionDetail, [name]: sanitizedValue });
        } else if (sanitizedValue === "") {
            // If the input is cleared, set the value to an empty string
            settransactionDetail({ ...transactionDetail, [name]: "" });
        } else {
            // If enteredValue is greater than depositBalance or not a valid number, set the value to depositBalance
            settransactionDetail({ ...transactionDetail, [name]: depositBalance });
        }
    };

    const [NewValue, setNewValue] = useState('');
    let NewCoinDepositMinus = (coin) => {

        const totalBalance = getTransactionsForCoin(coin.coinName, userCoins.getCoin.transactions);
        setNewValue(totalBalance.toFixed(8)); // Store the total balance directly
        setnewCoin(coin)
        setdepositName(coin.coinName.toLowerCase());
        setModal3(true);
    };

    const openEuroWithdraw = () => {
        const additionalCoins = newUserCoins || userCoins?.getCoin?.additionalCoins || UserData?.additionalCoins;
        const euroCoin = additionalCoins?.find(
            (coin) => String(coin.coinName || '').toLowerCase() === 'euro'
        );
        if (!euroCoin) {
            toast.error('Euro wallet not found');
            return;
        }
        if (!userCoins?.getCoin?.transactions) {
            toast.error('Unable to load euro balance');
            return;
        }
        NewCoinDepositMinus(euroCoin);
    };

    useEffect(() => {
        if (location.state?.openEuroWithdraw) {
            setAssetsTab('fiat');
            setPendingEuroWithdraw(true);
            Navigate('.', { replace: true, state: {} });
        }
    }, [location.state, Navigate]);

    useEffect(() => {
        if (!pendingEuroWithdraw || isLoading || !userCoins?.getCoin?.transactions) {
            return;
        }
        openEuroWithdraw();
        setPendingEuroWithdraw(false);
    }, [pendingEuroWithdraw, isLoading, userCoins]);

    let tetherDepositMinus = () => {
        setdepositName("tether");
        setModal3(true);
    };

    let btcDepositMinus = () => {
        setdepositName("bitcoin");
        setModal3(true);
    };
    let ethDepositMinus = () => {
        setdepositName("ethereum");

        setModal3(true);
    };
    let closeDeposit = () => {
        setdepositName("");
        settransactionDetail({
            amountMinus: 0,
        });
        setnewCoin({})
        setNewValue('')
        settransactionDetailId({
            txId: "",
        });
        setModal3(false);
        setotpModal(false);
        setConfirmationPopup(false);
    };

    const [activeBank, setactiveBank] = useState(false);
    let activeCrypto = () => {
        setactiveBank(false);
    };
    let activeBankOne = () => {
        setactiveBank(true);
    };
    //
    const postUserTransaction = async (e, isSendOtp) => {

        let id = authUser().user._id;

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
        if (e == "crypto") {
            body = {
                trxName: depositName,
                amount: -transactionDetail.amountMinus,
                txId: transactionDetailId.txId,
                e: e,
                // This will send for notification
                notification: true
            };
            if (!body.trxName || !body.amount || !body.txId) {

                toast.dismiss();
                toast.error("Fill all the required fields");
                return;
            }
            try {
                let id = authUser().user._id;
                setisDisable(true);
                if (isUserRestriction === true && isSendOtp) {
                    sendEmail()
                    return;

                } else {
                    const newTransaction = await createUserTransactionApi(id, body);

                    if (newTransaction.success) {

                        getUserRestrcition()
                        setSelectedPayment(null);
                        toast.dismiss();
                        setisDisable(false)
                        toast.success(newTransaction.msg);
                        closeDeposit();
                    } else {
                        closeDeposit();
                        getUserRestrcition()
                        setisDisable(false)
                        toast.dismiss();
                        toast.error(newTransaction.msg);
                    }
                }

            } catch (error) {
                closeDeposit();
                getUserRestrcition()
                toast.dismiss(); setisDisable(false)
                toast.error(error);
            } finally {
                // setisDisable(false);
            }
        } else if (e == "bank") {
            body = {
                trxName: depositName,
                amount: -transactionDetail.amountMinus,
                selectedPayment: selectedPayment,
                e: e,
                notification: true
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
                let id = authUser().user._id;
                if (isUserRestriction === true && isSendOtp) {

                    sendEmail()
                    return;
                } else {

                    const newTransaction = await createUserTransactionApi(id, body);

                    if (newTransaction.success) {

                        getUserRestrcition()
                        setSelectedPayment(null);
                        toast.dismiss();
                        setisDisable(false)
                        toast.success(newTransaction.msg);
                        closeDeposit();
                        setConfirmationPopup(false);

                        setModal3(false);
                    } else {
                        closeDeposit();
                        getUserRestrcition()
                        setisDisable(false)
                        toast.dismiss();
                        toast.error(newTransaction.msg);
                    }
                }
            } catch (error) {
                closeDeposit();
                toast.dismiss();
                setisDisable(false)

                getUserRestrcition()
                toast.error(error);
            } finally {
                // setisDisable(false);
            }
        }

        // Trigger the confirmation popup instead of API call
    };
    const verifyOtp = (e) => {
        setisDisable(true);

        if (Number(randomCode) === Number(otp)) {
            // ✅ OTP matched logic here

            postUserTransaction(e, false)
            return;
        } else {
            setTimeout(() => {
                setIsError({
                    show: true,
                    type: "The OTP you entered is incorrect. Please try again."
                });
                setisDisable(false);
            }, 2000);
        }
    };

    // Otp//////////////////////////

    const [isError, setIsError] = useState({
        show: false,
        type: ""
    });
    const [randomCode, setRandomCode] = useState(null);
    const [isDisable2, setisDisable2] = useState(false);
    const [otp, setOtp] = useState('');
    const [isEmail, setisEmail] = useState(false);
    const [isCode, setisCode] = useState(false);
    function generateRandomCode() {
        const min = 100000;
        const max = 999999;
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    const formatWithdrawalAmount = () => {
        const amount = transactionDetail.amountMinus;
        if (amount === "" || amount === null || amount === undefined) return "";

        if (depositName === "euro") {
            return `${Number(amount).toFixed(2)} EUR`;
        }
        if (depositName === "bitcoin") return `${amount} BTC`;
        if (depositName === "ethereum") return `${amount} ETH`;
        if (depositName === "tether") return `${amount} USDT`;
        if (newCoin?.coinSymbol) {
            return `${amount} ${String(newCoin.coinSymbol).toUpperCase()}`;
        }
        return String(amount);
    };
    let sendEmail = async () => {
        setisDisable(true)

        const newCode = generateRandomCode();

        try {
            let id = authUser().user._id;
            let email = authUser().user.email;
            let username = authUser().user.firstName;
            let body = { email, id, code: newCode, username, amount: formatWithdrawalAmount() };

            // setisDisable(true);
            const sendEmail = await sendEmailCodeApi(body);
            if (sendEmail.success) {
                toast.dismiss();
                setModal3(false)
                setotpModal(true)
                setRandomCode(newCode);
                toast.success(sendEmail.msg);
                setisCode(true);
                setisEmail(false);

            } else {
                toast.dismiss();
                toast.error(sendEmail.msg);
            }
        } catch (error) {
            toast.dismiss();
            toast.error(error?.data?.msg || error?.message || "Something went wrong");
        } finally {
            setisDisable(false);
        }
    };
    const [counter, setCounter] = useState(0);
    const [counterDisable, setCounterDisable] = useState(false);
    let reSend = async () => {
        const newCode = generateRandomCode();

        try {
            let id = authUser().user._id;
            let email = authUser().user.email;
            let username = authUser().user.firstName;
            let body = { email, id, code: newCode, username, amount: formatWithdrawalAmount() };

            setisDisable2(true);

            const sendEmail = await sendEmailCodeApi(body);
            if (sendEmail.success) {
                setCounter(60);
                setRandomCode(newCode);
                setCounterDisable(true)
                toast.dismiss();
            } else {
                setisDisable2(false);
                toast.dismiss();
                toast.error(sendEmail.msg);
            }
        } catch (error) {
            toast.dismiss();
            toast.error(error?.data?.msg || error?.message || "Something went wrong");
        } finally {
            setisDisable2(false);
        }
    };

    useEffect(() => {
        if (counter === 0) return; // stop if counter is 0
        const interval = setInterval(() => {
            setCounter((prev) => {
                if (prev <= 1) {
                    setCounterDisable(false); // enable button when finished
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [counter]);

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

    const selectedCoin = coinSlug ? findCoinBySlug(portfolioCoins, coinSlug) : null;

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

    const renderMainContent = () => {
        if (isLoading) {
            return (
                <div className={styles.shell}>
                    <div className={styles.spinner} />
                    <h4>Loading Assets...</h4>
                    <p>Please wait while we load your portfolio.</p>
                </div>
            );
        }

        if (UserData === null || !UserData) {
            return (
                <div className={styles.emptyState}>
                    <h4>No Assets found!</h4>
                    <p>Your wallet assets will appear here once available.</p>
                </div>
            );
        }

        if (coinSlug && !selectedCoin) {
            return (
                <div className={styles.emptyState}>
                    <h4>Asset not found</h4>
                    <p>The selected coin is not available in your wallet.</p>
                    <Button variant="primary" onClick={() => Navigate("/assets")}>
                        Back to Assets
                    </Button>
                </div>
            );
        }

        if (selectedCoin) {
            return (
                <CoinDetail
                    coin={selectedCoin}
                    isUser={isUser}
                    transactions={userCoins?.getCoin?.transactions || []}
                    onWithdraw={handleCoinWithdraw}
                    onRequestActivation={handleRequestActivation}
                    activatingCoinTrx={activatingCoinTrx}
                />
            );
        }

        return (
            <AssetsOverview
                coins={portfolioCoins}
                isUser={isUser}
                assetsTab={assetsTab}
                setAssetsTab={setAssetsTab}
                getEuroCryptoBalance={getEuroCryptoBalance}
                onEuroWithdraw={openEuroWithdraw}
                onRequestActivation={handleRequestActivation}
                activatingCoinTrx={activatingCoinTrx}
            />
        );
    };

    return (
        <>
            <div className={styles.assetsRoot}>
            {renderMainContent()}
            </div>
            {modal3 &&

                <Modal className="fade modal89"
                    show={modal3}
                    onHide={closeDeposit} centered>
                    <Modal.Header className="d-block">
                        <div className="d-flex justify-content-between align-items-center">
                            <Modal.Title>Create new Withdrawal</Modal.Title>
                            <Button
                                variant=""
                                onClick={closeDeposit}
                                className="btn-close"

                            ></Button>
                        </div>
                        <div className="mt-3 axs text-center">
                            <button
                                className={activeBank ? "btn  btn-outline-primary me-2" : "btn btn-primary  btn me-2"}
                                onClick={activeCrypto}
                            >
                                Crypto Withdraw
                            </button>
                            <button
                                className={activeBank ? "btn  btn-primary" : "btn btn-outline-primary"}
                                onClick={activeBankOne}
                            >
                                Bank/Card Withdraw
                            </button>
                        </div>
                    </Modal.Header>
                    <Modal.Body>

                        <h6 className="font-heading text-muted-400 text-sm font-medium leading-6">
                            {" "}
                            Selected Currency:{" "}
                            <span
                                className="inline-block px-3 bgact font-sans transition-shadow duration-300 py-1.5 text-xs rounded-md bg-info-500 dark:bg-info-500 text-white"
                                size="xs"
                                style={{ textTransform: "capitalize" }}
                            >
                                {depositName}
                            </span>
                        </h6>
                        <div className='pt-3'>
                            <div className="mb-3 ">
                                <label>Amount</label>
                                <input type="number"
                                    onFocus={() => (window.onwheel = () => false)} // Disable scrolling on focus
                                    onBlur={() => (window.onwheel = null)}
                                    onKeyDown={(e) =>
                                        [
                                            "ArrowUp",
                                            "ArrowDown",
                                            "e",
                                            "E",
                                            "+",
                                            "-",
                                            "*",
                                            "",
                                        ].includes(e.key) && e.preventDefault()
                                    }
                                    onChange={handleTransaction}
                                    value={transactionDetail.amountMinus}
                                    name="amountMinus"
                                    placeholder="Ex: 0.00000000"
                                    className="form-control"
                                />
                                {
                                    depositName === "bitcoin" ? (
                                        <p
                                            onClick={() =>
                                                settransactionDetail({
                                                    amountMinus: btcBalance.toFixed(8),
                                                })
                                            }
                                            className="text-muted-500 cursor-pointer dark:text-muted-400 mt-2 font-sans text-sm"
                                        >
                                            Available: {btcBalance.toFixed(8)} BTC
                                        </p>
                                    ) : depositName === "ethereum" ? (
                                        <p
                                            onClick={() =>
                                                settransactionDetail({
                                                    amountMinus: ethBalance.toFixed(8),
                                                })
                                            }
                                            className="text-muted-500 cursor-pointer dark:text-muted-400 mt-2 font-sans text-sm"
                                        >
                                            Available: {ethBalance.toFixed(8)} ETH
                                        </p>
                                    ) : depositName === "tether" ? (
                                        <p
                                            onClick={() =>
                                                settransactionDetail({
                                                    amountMinus: usdtBalance.toFixed(8),
                                                })
                                            }
                                            className="text-muted-500 cursor-pointer dark:text-muted-400 mt-2 font-sans text-sm"
                                        >
                                            Available: {usdtBalance.toFixed(8)} USDT
                                        </p>
                                    ) : depositName === "bnb" ? (
                                        <p
                                            onClick={() =>
                                                settransactionDetail({
                                                    amountMinus: NewValue,
                                                })
                                            }
                                            className="text-muted-500 cursor-pointer dark:text-muted-400 mt-2 font-sans text-sm"
                                        >
                                            Available: {NewValue} BNB
                                        </p>
                                    ) : depositName === "xrp" ? (
                                        <p
                                            onClick={() =>
                                                settransactionDetail({
                                                    amountMinus: NewValue,
                                                })
                                            }
                                            className="text-muted-500 cursor-pointer dark:text-muted-400 mt-2 font-sans text-sm"
                                        >
                                            Available: {NewValue} XRP
                                        </p>
                                    ) : depositName === "dogecoin" ? (
                                        <p
                                            onClick={() =>
                                                settransactionDetail({
                                                    amountMinus: NewValue,
                                                })
                                            }
                                            className="text-muted-500 cursor-pointer dark:text-muted-400 mt-2 font-sans text-sm"
                                        >
                                            Available: {NewValue} DOGE
                                        </p>
                                    ) : depositName === "euro" ? (
                                        <p
                                            onClick={() =>
                                                settransactionDetail({
                                                    amountMinus: NewValue,
                                                })
                                            }
                                            className="text-muted-500 cursor-pointer dark:text-muted-400 mt-2 font-sans text-sm"
                                        >
                                            Available: {NewValue} EUR
                                        </p>
                                    ) : depositName === "solana" ? (
                                        <p
                                            onClick={() =>
                                                settransactionDetail({
                                                    amountMinus: NewValue,
                                                })
                                            }
                                            className="text-muted-500 cursor-pointer dark:text-muted-400 mt-2 font-sans text-sm"
                                        >
                                            Available: {NewValue} SOL
                                        </p>
                                    ) : depositName === "toncoin" ? (
                                        <p
                                            onClick={() =>
                                                settransactionDetail({
                                                    amountMinus: NewValue,
                                                })
                                            }
                                            className="text-muted-500 cursor-pointer dark:text-muted-400 mt-2 font-sans text-sm"
                                        >
                                            Available: {NewValue} TON
                                        </p>
                                    ) : depositName === "chainlink" ? (
                                        <p
                                            onClick={() =>
                                                settransactionDetail({
                                                    amountMinus: NewValue,
                                                })
                                            }
                                            className="text-muted-500 cursor-pointer dark:text-muted-400 mt-2 font-sans text-sm"
                                        >
                                            Available: {NewValue} LINK
                                        </p>
                                    ) : depositName === "polkadot" ? (
                                        <p
                                            onClick={() =>
                                                settransactionDetail({
                                                    amountMinus: NewValue,
                                                })
                                            }
                                            className="text-muted-500 cursor-pointer dark:text-muted-400 mt-2 font-sans text-sm"
                                        >
                                            Available: {NewValue} DOT
                                        </p>
                                    ) : depositName === "near protocol" ? (
                                        <p
                                            onClick={() =>
                                                settransactionDetail({
                                                    amountMinus: NewValue,
                                                })
                                            }
                                            className="text-muted-500 cursor-pointer dark:text-muted-400 mt-2 font-sans text-sm"
                                        >
                                            Available: {NewValue} NEAR
                                        </p>
                                    ) : depositName === "usd coin" ? (
                                        <p
                                            onClick={() =>
                                                settransactionDetail({
                                                    amountMinus: NewValue,
                                                })
                                            }
                                            className="text-muted-500 cursor-pointer dark:text-muted-400 mt-2 font-sans text-sm"
                                        >
                                            Available: {NewValue} USDC
                                        </p>
                                    ) : depositName === "tron" ? (
                                        <p
                                            onClick={() =>
                                                settransactionDetail({
                                                    amountMinus: NewValue,
                                                })
                                            }
                                            className="text-muted-500 cursor-pointer dark:text-muted-400 mt-2 font-sans text-sm"
                                        >
                                            Available: {NewValue} TRX
                                        </p>
                                    ) : (
                                        ""
                                    )
                                }

                            </div>
                        </div>
                        <DropdownDivider />
                        <div>
                            <div className="border-top pt-4 mt-2">
                                {activeBank ? (
                                    <>
                                        <div className="d-flex align-items-center justify-content-between">
                                            <div>
                                                <h3 className="text-muted-400 font-heading text-base font-medium">
                                                    Payment Method
                                                </h3>
                                            </div>
                                        </div>
                                        <Form.Group className="mt-3">
                                            <Form.Control as="select" onChange={handlePaymentSelection}>
                                                <option>Select a Payment Method</option>
                                                {
                                                    isUser && isUser.payments && isUser.payments.length > 0 ? (
                                                        isUser.payments.map((item, index) => (
                                                            <option key={index}>
                                                                {item.type === "bank" ? (
                                                                    item.bank.accountName
                                                                ) : (
                                                                    <>
                                                                        <span className="text-uppercase">
                                                                            {item.card.cardCategory.toUpperCase()}
                                                                        </span>{" "}
                                                                        *{item.card.cardNumber.slice(-4)}
                                                                    </>
                                                                )}
                                                            </option>
                                                        ))) : (
                                                        <option disabled>No payment methods available</option>
                                                    )
                                                }
                                            </Form.Control>
                                        </Form.Group>
                                    </>
                                ) : (
                                    <>
                                        <div className="d-flex align-items-center justify-content-between">
                                            <div>
                                                <h3 className="text-muted-400 font-heading text-base font-medium">
                                                    Transaction details
                                                </h3>
                                            </div>
                                        </div>
                                        <Row className="mt-4">
                                            <Form.Group controlId="formGridReceivingAddress">
                                                <Form.Label>Receiving Address</Form.Label>
                                            </Form.Group>
                                            <Form.Group  >
                                                <InputGroup>
                                                    <Form.Control
                                                        type="text"
                                                        onChange={handleTransactionId}
                                                        value={transactionDetailId.txId}
                                                        name="txId"
                                                        placeholder="Ex: 0x1234567890"
                                                    />
                                                    <InputGroup.Text>
                                                        <i className="fas fa-wallet"></i>
                                                    </InputGroup.Text>
                                                </InputGroup>
                                            </Form.Group>
                                        </Row>
                                    </>
                                )}
                                <Row className="mt-4">
                                    <Col
                                    >
                                        <h5 className="text-muted-400 font-heading text-base font-medium">
                                            Total Amount
                                        </h5>
                                    </Col>
                                    <Col>
                                        <p className="mb-0 nui-label text-sm lks">
                                            {depositName === "bitcoin" ? (
                                                <span>
                                                    BTC {transactionDetail.amountMinus} ($
                                                    {(() => {
                                                        const amountInUSD = transactionDetail.amountMinus * liveBtc;
                                                        if (isUser.currency === "EUR") {
                                                            const amountInEUR = amountInUSD * 0.92;
                                                            return `${amountInEUR.toFixed(2)} EUR`;
                                                        } else {
                                                            return `${amountInUSD.toFixed(2)} USD`;
                                                        }
                                                    })()}
                                                    )
                                                </span>
                                            ) : depositName === "ethereum" ? (
                                                <span>
                                                    ETH {transactionDetail.amountMinus} ($
                                                    {(() => {
                                                        const amountInUSD = transactionDetail.amountMinus * (liveEth || 2640);
                                                        if (isUser.currency === "EUR") {
                                                            const amountInEUR = amountInUSD * 0.92;
                                                            return `${amountInEUR.toFixed(2)} EUR`;
                                                        } else {
                                                            return `${amountInUSD.toFixed(2)} USD`;
                                                        }
                                                    })()}
                                                    )
                                                </span>
                                            ) : depositName === "tether" ? (
                                                <span>
                                                    USDT {transactionDetail.amountMinus} ($
                                                    {(() => {
                                                        const amountInUSD = transactionDetail.amountMinus * 1;
                                                        if (isUser.currency === "EUR") {
                                                            const amountInEUR = amountInUSD * 0.92;
                                                            return `${amountInEUR.toFixed(2)} EUR`;
                                                        } else {
                                                            return `${amountInUSD.toFixed(2)} USD`;
                                                        }
                                                    })()}
                                                    )
                                                </span>
                                            ) : depositName === "euro" ? (
                                                <span>
                                                    {Number(transactionDetail.amountMinus || 0).toFixed(2)} EUR
                                                </span>
                                            ) : (
                                                <span className="uppercase">
                                                    <span style={{ textTransform: "uppercase" }}>{newCoin.coinSymbol} </span>
                                                    {transactionDetail.amountMinus} ($
                                                    {(() => {
                                                        const amountInUSD =
                                                            transactionDetail.amountMinus * getCoinPrice(newCoin.coinSymbol);
                                                        if (isUser.currency === "EUR") {
                                                            const amountInEUR = amountInUSD * 0.92;
                                                            return `${amountInEUR.toFixed(2)} EUR`;
                                                        } else {
                                                            return `${amountInUSD.toFixed(2)} USD`;
                                                        }
                                                    })()}
                                                    )
                                                </span>
                                            )}

                                        </p>
                                    </Col>
                                </Row>
                            </div>
                        </div>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button
                            onClick={closeDeposit}
                            variant="danger light"
                        >
                            Cancel
                        </Button>
                        {activeBank ? (

                            <Button
                                onClick={() => postUserTransaction("bank", true)}
                                disabled={isDisable} variant="primary">Create</Button>
                        ) : (

                            <Button
                                onClick={() => postUserTransaction("crypto", true)}
                                disabled={isDisable} variant="primary">Create</Button>

                        )}
                    </Modal.Footer>
                </Modal>
            }
            {otpModal && (
                <Modal className="fade modal89"
                    show={otpModal}
                    onHide={closeDeposit}
                    centered
                >
                    <Modal.Header className="d-block">
                        <div className="d-flex justify-content-between align-items-center w-100">
                            <Modal.Title>Two-Factor Authentication</Modal.Title>
                            <Button
                                variant=""
                                onClick={closeDeposit}
                                className="btn-close"
                            />
                        </div>
                    </Modal.Header>

                    <Modal.Body>
                        {/* Professional instruction */}
                        <h6 className="font-heading text-muted-400 text-sm mb-3">
                            For your security, we’ve sent a <strong>6-digit verification code </strong>
                            to your registered email address.
                            Please enter the code below to continue with your withdrawal.
                        </h6>

                        {/* OTP Input */}
                        <div className="mb-3">
                            <input
                                type="text"
                                maxLength={6}
                                className="form-control text-center fw-semibold fs-5"
                                placeholder="Enter 6-digit OTP"
                                value={otp}
                                onChange={(e) => {
                                    setOtp(e.target.value.replace(/\D/g, "")); // only digits
                                    setIsError({ show: false, type: "" });     // clear error on change
                                }}
                            />
                            {isError.show && (
                                <small className="text-danger d-block mt-1 fw-semibold">
                                    {isError.type}
                                </small>
                            )}
                        </div>

                        {/* Resend Button */}
                        <div className="text-center">
                            <Button
                                variant="outline-primary"
                                size="sm"
                                disabled={isDisable2 || counterDisable}
                                onClick={reSend}
                            >
                                {counterDisable ? `Resend in ${counter}s` : "Resend OTP"}
                            </Button>
                        </div>

                        <DropdownDivider />
                    </Modal.Body>

                    <Modal.Footer>
                        <Button
                            onClick={closeDeposit}
                            variant="danger light"
                        >
                            Cancel
                        </Button>

                        {activeBank ? (

                            <Button
                                onClick={() => verifyOtp("bank")}
                                disabled={isDisable || otp.length !== 6}

                                variant="primary">Verify & Withdraw</Button>
                        ) : (

                            <Button
                                onClick={() => verifyOtp("crypto")}
                                disabled={isDisable || otp.length !== 6}
                                variant="primary">Verify & Withdraw</Button>

                        )}

                    </Modal.Footer>
                </Modal>
            )}

        </>

    );
};

export default Orders;
