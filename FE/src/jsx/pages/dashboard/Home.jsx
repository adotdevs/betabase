import React, { useContext, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Col, Row } from 'react-bootstrap';

//Import 
import { SVGICON } from '../../constant/theme';
import MainSlider from '../../elements/dashboard/MainSlider';
import StatisticsBlog from '../../elements/dashboard/StatisticsBlog';
import MarketOverViewBlog from '../../elements/dashboard/MarketOverViewBlog';
import RecentTransaction from '../../elements/dashboard/RecentTransaction';
import DashboardAssetsWallets from './DashboardAssetsWallets';
import { ThemeContext } from '../../../context/ThemeContext';
import { useAuthUser, useSignOut } from 'react-auth-kit';
import { toast } from 'react-toastify';
import { getCoinsUserApi, getHtmlDataApi, getsignUserApi, patchCoinsApi, getLinksApi } from '../../../Api/Service';
import axios from 'axios';

const compare = ['/dashboard', '/index-2'];

export function MainComponent() {
	const [modal, setModal] = useState(false);
	const [isLoading, setisLoading] = useState(true);
	const [UserData, setUserData] = useState(true);
	const [totalBalance, settotalBalance] = useState(null);
	const [totalBalancePending, settotalBalancePending] = useState(null);
	const [fractionBalance, setfractionBalance] = useState(null);
	const [fractionBalancePending, setfractionBalancePending] = useState(null);
	const [Description, setDescription] = useState(null);
	const [Description2, setDescription2] = useState(null);
	const [showReferralAd, setShowReferralAd] = useState(false);
	const [referralLinkEnabled, setReferralLinkEnabled] = useState(false);

	const [singleTransaction, setsingleTransaction] = useState();
	const [UserTransactions, setUserTransactions] = useState([]);
	const [btcBalance, setbtcBalance] = useState(0);

	const [ethBalance, setethBalance] = useState(0);
	const [usdtBalance, setusdtBalance] = useState(0);
	const [Active, setActive] = useState(false);

	const [liveBtc, setliveBtc] = useState(null);
	let AuthUse = useAuthUser();
	let signOut = useSignOut();
	const [isUser, setIsUser] = useState({});
	let Navigate = useNavigate();
	let toggleDrop = () => {
		drop ? setdrop(false) : setdrop(true);
	};
	const [drop, setdrop] = useState(false);
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
	const getsignUser = async () => {
		try {
			const formData = new FormData();
			formData.append("id", AuthUse().user._id);
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
	let authUser = useAuthUser();
	const [Admin, setAdmin] = useState("");
	const getCoins = async (data) => {
		let id = data._id;
		try {
			const userCoins = await getCoinsUserApi(id);
			// const response = await axios.get(
			// 	"https://api.coindesk.com/v1/bpi/currentprice.json"
			// );

			if (userCoins.success) {
				setUserData(userCoins.getCoin);
				// setUserTransactions;

				setUserTransactions(
					userCoins.getCoin.transactions.reverse().slice(0, 5)
				);
				setisLoading(false);
				// tx
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
					ethVal = 2640
				}
				let lakh = btcValueAdded * val;
				const totalValue = (
					lakh +
					ethValueAdded * ethVal +
					usdtValueAdded
				).toFixed(2);

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
				settotalBalance(formattedTotalValue);

				// Pending one  // tx
				const btcPending = userCoins.getCoin.transactions.filter(
					(transaction) => transaction.trxName.includes("bitcoin")
				);
				const btccompletePending = btcPending.filter((transaction) =>
					transaction.status.includes("pending")
				);
				let btcCountPending = 0;
				let btcValueAddedPending = 0;
				for (let i = 0; i < btccompletePending.length; i++) {
					const element = btccompletePending[i];
					btcCountPending = element.amount;
					btcValueAddedPending += btcCountPending;
				}
				// tx
				// tx
				const ethPending = userCoins.getCoin.transactions.filter(
					(transaction) => transaction.trxName.includes("ethereum")
				);
				const ethcompletePending = ethPending.filter((transaction) =>
					transaction.status.includes("pending")
				);
				let ethCountPending = 0;
				let ethValueAddedPending = 0;
				for (let i = 0; i < ethcompletePending.length; i++) {
					const element = ethcompletePending[i];
					ethCountPending = element.amount;
					ethValueAddedPending += ethCountPending;
				}
				// tx
				// tx
				const usdtPending = userCoins.getCoin.transactions.filter(
					(transaction) => transaction.trxName.includes("tether")
				);
				const usdtcompletePending = usdtPending.filter((transaction) =>
					transaction.status.includes("pending")
				);
				let usdtCountPending = 0;
				let usdtValueAddedPending = 0;
				for (let i = 0; i < usdtcompletePending.length; i++) {
					const element = usdtcompletePending[i];
					usdtCountPending = element.amount;
					usdtValueAddedPending += usdtCountPending;
				}
				// tx

				let lakhPending = btcValueAddedPending * val;
				const totalValuePending = (
					lakhPending +
					ethValueAddedPending * ethVal +
					usdtValueAddedPending
				).toFixed(2);

				const [integerPartPending, fractionalPartPending] =
					totalValuePending.split(".");

				const formattedTotalValuePending = parseFloat(
					integerPartPending
				).toLocaleString("en-US", {
					style: "currency",
					currency: "USD",
					minimumFractionDigits: 0,
					maximumFractionDigits: 0,
				});

				//
				setfractionBalancePending(fractionalPartPending);
				settotalBalancePending(formattedTotalValuePending);

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

	const getHtmlData = async () => {
		try {
			const description = await getHtmlDataApi();
			if (description.success) {
				setDescription(description?.description[0]?.description);
				setDescription2(description?.description[1]?.description);

				return;
			} else {
				toast.error(description.msg);
			}
		} catch (error) {
			toast.error(error);
		} finally {
		}
	};

	const fetchLinks = async () => {
		try {
			const data = await getLinksApi();
			if (data?.links && Array.isArray(data.links)) {
				// Check if referral system link (index 9) is enabled
				const referralLink = data.links[9];
				if (referralLink) {
					setReferralLinkEnabled(referralLink.enabled);
				}
			}
		} catch (error) {
			console.error("Error fetching links:", error);
		}
	};
	useEffect(() => {
		if (authUser().user.role === "user") {
			getsignUser()
			getHtmlData()
			fetchLinks()
			setAdmin(authUser().user);
			getCoins(authUser().user);
			patchCoins()
			// Check if referral ad was dismissed
			const adDismissed = localStorage.getItem('referralAdDismissed');
			if (adDismissed === 'true') {
				setShowReferralAd(false);
			}else{
				setShowReferralAd(true);
			}
			return;
		} else if (authUser().user.role === "admin") {
			setAdmin(authUser().user);
			return;
		}
	}, []);

	const dismissReferralAd = () => {
		setShowReferralAd(false);
		localStorage.setItem('referralAdDismissed', 'true');
	};

	return (
		<Row>
			<Col xl={12}>
				<div className="row main-card">
					<MainSlider />
				</div>
				{/* MLM Referral Promo Ad - Dismissible */}
				{showReferralAd && referralLinkEnabled && (
					<Row className="my-2">
						<Col xl={12}>
							<div className="card new-bg-dark" style={{
								background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
								border: '2px solid rgba(255, 255, 255, 0.2)',
								position: 'relative',
								overflow: 'hidden'
							}}>
								<button 
									onClick={dismissReferralAd}
									style={{
										position: 'absolute',
										top: '10px',
										right: '10px',
										background: 'rgba(255, 255, 255, 0.2)',
										border: 'none',
										borderRadius: '50%',
										width: '30px',
										height: '30px',
										cursor: 'pointer',
										color: 'white',
										fontSize: '18px',
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										transition: 'all 0.3s ease',
										zIndex: 10
									}}
									onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.4)'}
									onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
								>
									×
								</button>
								<div className="card-body" style={{ padding: '30px' }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
										<div style={{
											background: 'rgba(255, 255, 255, 0.15)',
											borderRadius: '50%',
											width: '80px',
											height: '80px',
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											fontSize: '40px',
											flexShrink: 0
										}}>
											💰
										</div>
										<div style={{ flex: 1, minWidth: '250px' }}>
											<h3 style={{ 
												color: 'white', 
												fontWeight: '700',
												fontSize: '28px',
												marginBottom: '15px',
												textShadow: '0 2px 4px rgba(0,0,0,0.2)'
											}}>
												Turn Your Friends Into Cash! 🚀
											</h3>
											<p style={{ 
												color: 'rgba(255, 255, 255, 0.95)', 
												fontSize: '16px',
												lineHeight: '1.6',
												marginBottom: '20px'
											}}>
												Turn your friends into crypto buddies and your invites into cash! Share your unique code and get <strong>$100</strong> for every friend who signs up and starts trading. The more you refer, the more you earn — it's that simple. Let's make crypto social — invite, earn, repeat!
											</p>
											<Link 
												to="/user/referral-promo" 
												style={{
													display: 'inline-block',
													background: 'white',
													color: '#667eea',
													padding: '12px 30px',
													borderRadius: '30px',
													fontWeight: '700',
													textDecoration: 'none',
													boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
													transition: 'all 0.3s ease'
												}}
												onMouseEnter={(e) => {
													e.target.style.transform = 'translateY(-2px)';
													e.target.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
												}}
												onMouseLeave={(e) => {
													e.target.style.transform = 'translateY(0)';
													e.target.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
												}}
											>
												Get Your Referral Code Now →
											</Link>
										</div>
									</div>
								</div>
							</div>
						</Col>
					</Row>
				)}
				{
					Description === "" || Description === null || Description === undefined ? "" :
						<Row className="my2 mt-2">
							<Col xl={12}>
								<div className="card new-bg-dark kyc-form-card">
									{/* <div className="card-header text-white">
										<h4 className="card-title text-white">Verify Your Identity for Enhanced Security</h4>
									</div> */}
									<div className="card-body text-white">

										<p
											className="htmData"
											dangerouslySetInnerHTML={{ __html: Description }}
										/>
									</div>
								</div>
							</Col>
						</Row>
				}
				{isUser.submitDoc && isUser.submitDoc.status === "pending" ? (
					<Row className="my-1">
						<Col xl={12}>
							<div className="card new-bg-dark kyc-form-card">
								<div className="card-header text-white">
									<h4 className="card-title text-white">Verify Your Identity for Enhanced Security</h4>
								</div>
								<div className="card-body text-white">
									<p>We prioritize the safety and security of our platform to ensure a seamless experience for all users.</p>
									<p>Completing the KYC process is an essential step in maintaining a secure environment and complying with regulatory standards.</p>
									<p>To activate your wallet, please complete the identification process.</p>
									<Alert variant="warning" dismissible className="solid alert-right-icon">
										<span><i className='mdi mdi-alert'></i></span>{" "}
										Please verify your identity
									</Alert>
									<Link to="/flows/kyc">
										<Button to="/flows/kyc" variant="primary" className="mt-3">
											Start KYC
										</Button>
									</Link>
								</div>
							</div>
						</Col>
					</Row>
				) : ""}
				<Row>
					<div className="col-xl-12">
						<DashboardAssetsWallets />
					</div>
					{/* <div className="col-xl-6">
						<div className="card market-chart">
							<div className="card-header border-0 pb-0 flex-wrap">
								<div className="mb-0">
									<h4 className="card-title">Payment Methods</h4> 
								</div>
								<Link to={"/account"} className="btn-link text-primary get-report mb-2">
									
									All Accounts
								</Link>
							</div>
							<MarketOverViewBlog />
						</div>
					</div> */}
				</Row>
				<Col lg={12}>
					<RecentTransaction />
				</Col>
				{
					Description2 === "" || Description2 === null || Description2 === undefined ? "" :
						<Row className="my2 mt-2">
							<Col xl={12}>
								<div className="card new-bg-dark kyc-form-card">
									{/* <div className="card-header text-white">
										<h4 className="card-title text-white">Verify Your Identity for Enhanced Security</h4>
									</div> */}
									<div className="card-body text-white">

										<p
											className="htmData"
											dangerouslySetInnerHTML={{ __html: Description2 }}
										/>
									</div>
								</div>
							</Col>
						</Row>
				}
			</Col>
		</Row >
	)
}

const Home = () => {
	const { changeBackground } = useContext(ThemeContext);
	useEffect(() => {
		changeBackground({ value: "light", label: "Light" });
	}, []);
	return (
		<>
			<MainComponent />
		</>
	)
}

export default Home;