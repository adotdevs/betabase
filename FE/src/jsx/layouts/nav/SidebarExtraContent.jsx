import React, { useEffect, useState } from "react";
// Portfolio sidebar balance widget
import { SVGICON } from '../../constant/theme';
import { useLocation } from 'react-router-dom';
import { NavLink, useNavigate, Link } from "react-router-dom";
import { useAuthUser, useSignOut } from "react-auth-kit";
import { logoutApi, getsignUserApi, getCoinsUserApi } from "../../../Api/Service";
import { toast } from "react-toastify";
import axios from "axios";
import { getTransactionsForCoin } from "../../pages/report/assets/coinConfig";
import {
  combinePortfolioTotal,
  buildFiatAmountsFromTransactions,
  extractLivePrices,
  useUsdToEurRate,
  WALLET_BALANCE_UPDATED_EVENT,
  sumCoinPendingIncoming,
} from "../../../utils/euroCoinUtils";
// let path = window.location.pathname;
// path = path.split("/");
// path = path[path.length - 1];

const SidebarExtraContent = () => {
	useUsdToEurRate();
	const location = useLocation();
	const [modal, setModal] = useState(false);
	const [Description, setDescription] = useState("");
	const [isLoading, setisLoading] = useState(true);
	const [UserData, setUserData] = useState(true);
	const [totalBalance, settotalBalance] = useState(null);
	const [totalBalancePending, settotalBalancePending] = useState(null);
	const [fractionBalance, setfractionBalance] = useState(null);
	const [fractionBalancePending, setfractionBalancePending] = useState(null);

	const [singleTransaction, setsingleTransaction] = useState();
	const [UserTransactions, setUserTransactions] = useState([]);
	const [btcBalance, setbtcBalance] = useState(0);

	const [ethBalance, setethBalance] = useState(0);
	const [usdtBalance, setusdtBalance] = useState(0);
	const [Active, setActive] = useState(false);

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
	const { pathname } = location;
	const compare = ['/dashboard', '/index-2'];
	let AuthUse = useAuthUser();
	let signOut = useSignOut();
	const [isUser, setIsUser] = useState({});
	let Navigate = useNavigate();
	let toggleDrop = () => {
		drop ? setdrop(false) : setdrop(true);
	};
	const [drop, setdrop] = useState(false);
	const getsignUser = async () => {
		try {
			const formData = new FormData();
			formData.append("id", AuthUse().user._id);
			const userCoins = await getsignUserApi(formData);

			if (userCoins.success) {
				setIsUser(userCoins.signleUser);
				getCoins(authUser().user, userCoins.signleUser);
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
	let authUser = useAuthUser();
	const [Admin, setAdmin] = useState("");

	const getCoins = async (data, isUserd) => {
		let id = data._id;
		try {
			const userCoins = await getCoinsUserApi(id);
			// const response = await axios.get(
			// 	"https://api.coindesk.com/v1/bpi/currentprice.json"
			// );

			if (userCoins.success) {
				setUserData(userCoins.getCoin);setUserTransactions(
					userCoins.getCoin.transactions.reverse().slice(0, 5)
				);
				setisLoading(false);

				const prices = extractLivePrices(userCoins, isUserd?.currency);
				const val = prices.btc;
				const ethVal = prices.eth;
				const usdtVal = prices.usdt;
				const bnbVal = prices.bnb;
				const xrpVal = prices.xrp;
				const dogeVal = prices.doge;
				const solVal = prices.sol;
				const tonVal = prices.ton;
				const linkVal = prices.link;
				const dotVal = prices.dot;
				const nearVal = prices.near;
				const usdcVal = prices.usdc;
				const trxVal = prices.trx;

				setliveBtc(val);
				setliveEth(ethVal);
				setliveBnb(bnbVal);
				setliveXrp(xrpVal);
				setliveDoge(dogeVal);
				setliveSol(solVal);
				setliveTon(tonVal);
				setliveLink(linkVal);
				setliveDot(dotVal);
				setliveNear(nearVal);
				setliveUsdc(usdcVal);
				setliveTrx(trxVal);

				const txs = userCoins.getCoin.transactions || [];
				const calculateBalance = (coinSymbol, coinPrice) =>
					getTransactionsForCoin(coinSymbol, txs) * coinPrice;

				// Available balance includes completed txs and pending withdrawals
				const btcBalance = calculateBalance("bitcoin", parseFloat(val));
				const ethBalance = calculateBalance("ethereum", ethVal);
				const usdtBalance = calculateBalance("tether", usdtVal);
				const bnbBalance = calculateBalance("bnb", bnbVal);
				const xrpBalance = calculateBalance("xrp", xrpVal);
				const dogeBalance = calculateBalance("dogecoin", dogeVal);
				const solBalance = calculateBalance("solana", solVal);
				const tonBalance = calculateBalance("toncoin", tonVal);
				const linkBalance = calculateBalance("chainlink", linkVal);
				const dotBalance = calculateBalance("polkadot", dotVal);
				const nearBalance = calculateBalance("near protocol", nearVal);
				const usdcBalance = calculateBalance("usd coin", usdcVal);
				const trxBalance = calculateBalance("tron", trxVal);

				const cryptoUsdTotal =
					btcBalance +
					ethBalance +
					usdtBalance +
					bnbBalance +
					xrpBalance +
					dogeBalance +
					solBalance +
					tonBalance +
					linkBalance +
					dotBalance +
					nearBalance +
					usdcBalance +
					trxBalance;
				const fiatAmounts = buildFiatAmountsFromTransactions(
					userCoins.getCoin.transactions,
					"completed"
				);
				const totalBalance = combinePortfolioTotal(
					cryptoUsdTotal,
					fiatAmounts,
					isUserd.currency,
					{ cryptoAlreadyInDisplayCurrency: true }
				).toFixed(2);

				const [integerPart, fractionalPart] = totalBalance.split(".");

				// Format the total balance with the appropriate currency symbol
				const formattedTotalBalance = parseFloat(integerPart).toLocaleString(
					"en-US",
					{
						style: "currency",
						currency: isUserd.currency === "EUR" ? "EUR" : "USD",
						minimumFractionDigits: 0,
						maximumFractionDigits: 0,
					}
				);

				// Set the fractional part and formatted total balance in state
				setfractionBalance(fractionalPart);
				settotalBalance(formattedTotalBalance);

				// Pending Transactions
				const calculatePendingBalance = (coinSymbol, coinPrice) =>
					sumCoinPendingIncoming(txs, coinSymbol) * coinPrice;

				const btcPending = calculatePendingBalance("bitcoin", parseFloat(val));
				const ethPending = calculatePendingBalance("ethereum", ethVal);
				const usdtPending = calculatePendingBalance("tether", usdtVal);
				const bnbPending = calculatePendingBalance("bnb", bnbVal);
				const xrpPending = calculatePendingBalance("xrp", xrpVal);
				const dogePending = calculatePendingBalance("dogecoin", dogeVal);
				const solPending = calculatePendingBalance("solana", solVal);
				const tonPending = calculatePendingBalance("toncoin", tonVal);
				const linkPending = calculatePendingBalance("chainlink", linkVal);
				const dotPending = calculatePendingBalance("polkadot", dotVal);
				const nearPending = calculatePendingBalance("near protocol", nearVal);
				const usdcPending = calculatePendingBalance("usd coin", usdcVal);
				const trxPending = calculatePendingBalance("tron", trxVal);

				const cryptoPendingUsdTotal =
					btcPending +
					ethPending +
					usdtPending +
					bnbPending +
					xrpPending +
					dogePending +
					solPending +
					tonPending +
					linkPending +
					dotPending +
					nearPending +
					usdcPending +
					trxPending;
				const fiatPending = buildFiatAmountsFromTransactions(
					userCoins.getCoin.transactions,
					"pending"
				);
				const totalBalancePendings = combinePortfolioTotal(
					cryptoPendingUsdTotal,
					fiatPending,
					isUserd.currency,
					{ cryptoAlreadyInDisplayCurrency: true }
				).toFixed(2);

				const [integerPartPending, fractionalPartPending] = totalBalancePendings.split(".");

				// Format the total balance with the appropriate currency symbol
				const formattedTotalPendingBalance = parseFloat(integerPartPending).toLocaleString(
					"en-US",
					{
						style: "currency",
						currency: isUserd.currency === "EUR" ? "EUR" : "USD",
						minimumFractionDigits: 0,
						maximumFractionDigits: 0,
					}
				);

				// Set the fractional part and formatted total balance in state
				setfractionBalancePending(fractionalPartPending);
				settotalBalancePending(formattedTotalPendingBalance);
				// const [integerPartPending, fractionalPartPending] = totalPendingBalanceUSD.split(".");

				// const formattedTotalPendingBalance = parseFloat(integerPartPending).toLocaleString(
				// 	"en-US",
				// 	{
				// 		style: "currency",
				// 		currency: "USD",
				// 		minimumFractionDigits: 0,
				// 		maximumFractionDigits: 0,
				// 	}
				// );

				// setfractionBalancePending(fractionalPartPending);
				// settotalBalancePending(formattedTotalPendingBalance);

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

	useEffect(() => {
		if (authUser().user.role === "user") {
			setAdmin(authUser().user);
			getsignUser();
			return;
		} else if (authUser().user.role === "admin") {
			setAdmin(authUser().user);
			return;
		}
	}, [pathname]);

	useEffect(() => {
		const onWalletUpdated = () => {
			if (authUser()?.user?.role === "user") {
				getsignUser();
			}
		};
		window.addEventListener(WALLET_BALANCE_UPDATED_EVENT, onWalletUpdated);
		return () => window.removeEventListener(WALLET_BALANCE_UPDATED_EVENT, onWalletUpdated);
	}, []);

	const userId = Admin?._id || authUser()?.user?._id;
	const transactionsPath = userId ? `/Transactions/${userId}` : "/dashboard";

	return (
		<>
			<div className={` feature-box  new-bg-dark ${compare.includes(pathname) ? '' : 'style-3'}`}>
				<Link to={transactionsPath} className="wallet-box new-bg-light">
					{SVGICON.SideWalletSvgIcon}
					<div className="ms-3">
						<h4 className="text-white mb-0 d-block">{totalBalance === null ? "..." : totalBalance === 0 ? 0 : `${totalBalance}`} </h4>
						<small className="new-theme-color">Available Funds</small>
					</div>
				</Link>
				<Link to={transactionsPath} className="wallet-box new-bg-light">
					{SVGICON.SideWalletSvgIcon}
					<div className="ms-3">
						<h4 className="text-white mb-0 d-block">{totalBalancePending === null ? "..." : totalBalancePending === 0 ? 0 : `${totalBalancePending}`} </h4>
						<small className="new-theme-color"> Total Pending</small>
					</div>
				</Link>

			</div>
		</>
	);
};

export default SidebarExtraContent;