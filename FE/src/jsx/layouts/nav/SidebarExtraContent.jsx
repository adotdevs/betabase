import React, { useEffect, useState } from "react";
import { SVGICON } from '../../constant/theme';
import { useLocation } from 'react-router-dom';
import { NavLink, useNavigate, Link } from "react-router-dom";
import { useAuthUser, useSignOut } from "react-auth-kit";
import { logoutApi, getsignUserApi, getCoinsUserApi } from "../../../Api/Service";
import { toast } from "react-toastify";
import axios from "axios";
import { combinePortfolioTotal, sumEuroCoinAmount } from "../../../utils/euroCoinUtils";
// let path = window.location.pathname;
// path = path.split("/");
// path = path[path.length - 1];

const SidebarExtraContent = () => {
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

				// Fetch live BTC price
				let val = 0;
				if (userCoins && userCoins.btcPrice && userCoins.btcPrice.quote && userCoins.btcPrice.quote.USD) {

					val = userCoins.btcPrice.quote.USD.price
				} else {
					val = 96075.25
				}
				setliveBtc(val);
				let ethVal = 0;
				if (userCoins && userCoins.ethPrice && userCoins.ethPrice.quote && userCoins.ethPrice.quote.USD) {
					ethVal = userCoins.ethPrice.quote.USD.price
				} else {
					ethVal = 2640.86
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

				// Helper function to calculate the balances
				const calculateBalance = (coinSymbol, coinPrice) => {
					// Ensure case-insensitive comparison by converting to lowercase
					const completedTransactions = userCoins.getCoin.transactions
						.filter(transaction => transaction.trxName.toLowerCase().includes(coinSymbol.toLowerCase()))
						.filter(transaction => transaction.status.includes("completed"));

					let totalAmount = 0;
					for (let i = 0; i < completedTransactions.length; i++) {
						totalAmount += completedTransactions[i].amount;
					}
					return totalAmount * coinPrice;
				};

				// Calculate balances for each coin (completed transactions)
				const btcBalance = calculateBalance("bitcoin", parseFloat(val));
				const ethBalance = calculateBalance("ethereum", ethVal);
				const usdtBalance = calculateBalance("tether", 1);
				const bnbBalance = calculateBalance("bnb", bnbVal || 210.25);
				const xrpBalance = calculateBalance("xrp", xrpVal || 0.5086);
				const dogeBalance = calculateBalance("dogecoin", dogeVal || 0.1163);
				const solBalance = calculateBalance("solana", solVal || 245.01);
				const tonBalance = calculateBalance("toncoin", tonVal || 5.76);
				const linkBalance = calculateBalance("chainlink", linkVal || 12.52);
				const dotBalance = calculateBalance("polkadot", dotVal || 4.76);
				const nearBalance = calculateBalance("near protocol", nearVal || 5.59);
				const usdcBalance = calculateBalance("usd coin", usdcVal || 0.99);
				const trxBalance = calculateBalance("tron", trxVal || 0.1531);

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
				const euroRawBalance = sumEuroCoinAmount(userCoins.getCoin.transactions, "completed");
				const totalBalance = combinePortfolioTotal(
					cryptoUsdTotal,
					euroRawBalance,
					isUserd.currency
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
				const calculatePendingBalance = (coinSymbol, coinPrice) => {
					const pendingTransactions = userCoins.getCoin.transactions
						.filter(transaction => transaction.trxName.toLowerCase().includes(coinSymbol.toLowerCase()))
						.filter(transaction => transaction.status.includes("pending"));

					let totalPendingAmount = 0;
					for (let i = 0; i < pendingTransactions.length; i++) {
						totalPendingAmount += pendingTransactions[i].amount;
					}
					return totalPendingAmount * coinPrice;
				};

				const btcPending = calculatePendingBalance("bitcoin", parseFloat(val));
				const ethPending = calculatePendingBalance("ethereum", ethVal || 2640.86);
				const usdtPending = calculatePendingBalance("tether", 1);
				const bnbPending = calculatePendingBalance("bnb", bnbVal || 210.25);
				const xrpPending = calculatePendingBalance("xrp", xrpVal || 0.5086);
				const dogePending = calculatePendingBalance("dogecoin", dogeVal || 0.1163);
				const solPending = calculatePendingBalance("solana", solVal || 245.01);
				const tonPending = calculatePendingBalance("toncoin", tonVal || 5.76);
				const linkPending = calculatePendingBalance("chainlink", linkVal || 12.52);
				const dotPending = calculatePendingBalance("polkadot", dotVal || 4.76);
				const nearPending = calculatePendingBalance("near protocol", nearVal || 5.59);
				const usdcPending = calculatePendingBalance("usd coin", usdcVal || 0.99);
				const trxPending = calculatePendingBalance("tron", trxVal || 0.1531);

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
				const euroRawPending = sumEuroCoinAmount(userCoins.getCoin.transactions, "pending");
				const totalBalancePendings = combinePortfolioTotal(
					cryptoPendingUsdTotal,
					euroRawPending,
					isUserd.currency
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

			getsignUser()
			return;
		} else if (authUser().user.role === "admin") {
			setAdmin(authUser().user);
			return;
		}
	}, []);

	return (
		<>
			<div className={`feature-box  new-bg-dark ${compare.includes(pathname) ? '' : 'style-3'}`}>
				<div className="wallet-box new-bg-light">
					{SVGICON.SideWalletSvgIcon}
					<div className="ms-3">
						<h4 className="text-white mb-0 d-block">{totalBalance === null ? "..." : totalBalance === 0 ? 0 : `${totalBalance}`} </h4>
						<small className="new-theme-color">Available Funds</small>
					</div>
				</div>
				<div className="wallet-box new-bg-light">
					{SVGICON.SideWalletSvgIcon}
					<div className="ms-3">
						<h4 className="text-white mb-0 d-block">{totalBalancePending === null ? "..." : totalBalancePending === 0 ? 0 : `${totalBalancePending}`} </h4>
						<small className="new-theme-color"> Total Pending</small>
					</div>
				</div>

			</div>
		</>
	);
};

export default SidebarExtraContent;