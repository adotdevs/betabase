import Bitcoin from "../../../../assets/images/img/btc.svg";
import EthLogo from "../../../../assets/images/img/eth.svg";
import UsdtLogo from "../../../../assets/images/img/usdt-logo.svg";
import BNBcoin from "../../../../assets/images/new/bnb.png";
import Coin1 from "../../../../assets/images/new/1.png";
import Coin2 from "../../../../assets/images/new/2.png";
import Coin3 from "../../../../assets/images/new/3.png";
import Coin4 from "../../../../assets/images/new/4.png";
import Coin5 from "../../../../assets/images/new/5.png";
import Coin6 from "../../../../assets/images/new/6.png";
import Coin7 from "../../../../assets/images/new/7.png";
import Coin8 from "../../../../assets/images/new/8.png";
import SolIco from "../../../../assets/images/new/solana.png";

export const coinLogos = {
  bnb: BNBcoin,
  xrp: Coin1,
  dogecoin: Coin2,
  toncoin: Coin3,
  chainlink: Coin4,
  polkadot: Coin5,
  "near protocol": Coin6,
  "usd coin": Coin7,
  tron: Coin8,
  solana: SolIco,
};

export const CMC_IDS = {
  bitcoin: "1",
  ethereum: "1027",
  tether: "825",
  bnb: "1839",
  xrp: "52",
  dogecoin: "74",
  solana: "5426",
  toncoin: "11419",
  chainlink: "1975",
  polkadot: "6636",
  "near protocol": "6535",
  "usd coin": "3408",
  tron: "1958",
};

export const COINGECKO_IDS = {
  bitcoin: "bitcoin",
  ethereum: "ethereum",
  tether: "tether",
  bnb: "binancecoin",
  xrp: "ripple",
  dogecoin: "dogecoin",
  solana: "solana",
  toncoin: "the-open-network",
  chainlink: "chainlink",
  polkadot: "polkadot",
  "near-protocol": "near",
  "usd-coin": "usd-coin",
  tron: "tron",
};

export const getCoinGeckoId = (slug) => COINGECKO_IDS[slug] || "";

export const getAdditionalCoinPrice = (coinSymbol, livePrices = {}) => {
  switch (String(coinSymbol || "").toLowerCase()) {
    case "bnb":
      return livePrices.bnb || 210.25;
    case "xrp":
      return livePrices.xrp || 0.5086;
    case "doge":
      return livePrices.doge || 0.1163;
    case "eur":
      return 1;
    case "sol":
      return livePrices.sol || 245.01;
    case "ton":
      return livePrices.ton || 5.76;
    case "link":
      return livePrices.link || 12.52;
    case "dot":
      return livePrices.dot || 4.76;
    case "near":
      return livePrices.near || 5.59;
    case "usdc":
      return livePrices.usdc || 0.99;
    case "trx":
      return livePrices.trx || 0.1531;
    default:
      return 0;
  }
};

export const CORE_COINS = [
  {
    slug: "bitcoin",
    name: "Bitcoin",
    symbol: "BTC",
    trxName: "bitcoin",
    logo: Bitcoin,
    cmcId: "1",
    accent: "#F7931A",
  },
  {
    slug: "ethereum",
    name: "Ethereum",
    symbol: "ETH",
    trxName: "ethereum",
    logo: EthLogo,
    cmcId: "1027",
    accent: "#627EEA",
  },
  {
    slug: "tether",
    name: "Tether",
    symbol: "USDT",
    trxName: "tether",
    logo: UsdtLogo,
    cmcId: "825",
    accent: "#26A17B",
  },
];

export const slugFromTrxName = (trxName) =>
  String(trxName || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-");

export const getTransactionsForCoin = (coinSymbol, transactions = []) => {
  const needle = String(coinSymbol || "").toLowerCase();
  if (!needle) return 0;

  const coinTransactions = transactions.filter((transaction) =>
    String(transaction.trxName || "").toLowerCase().includes(needle)
  );
  const completedTransactions = coinTransactions.filter((transaction) =>
    String(transaction.status || "").toLowerCase().includes("completed")
  );

  return completedTransactions.reduce(
    (total, transaction) => total + parseFloat(transaction.amount || 0),
    0
  );
};

export const formatFiatValue = (amountUsd, currency = "USD") => {
  const num = Number(amountUsd);
  const safe = Number.isFinite(num) ? num : 0;
  if (currency === "EUR") {
    return `${(safe * 0.92).toFixed(2)} EUR`;
  }
  return `${safe.toFixed(2)} USD`;
};

export const formatCoinAmount = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
};

export const formatLivePrice = (price) => {
  const num = Number(price);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
};

export const buildPortfolioCoins = ({
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
}) => {
  const transactions = userCoins?.getCoin?.transactions || [];

  const coreCoins = CORE_COINS.map((coin) => {
    let balance = 0;
    let price = 0;
    let address = "";

    if (coin.trxName === "bitcoin") {
      balance = btcBalance;
      price = liveBtc || 0;
      address = UserData?.btcTokenAddress || "";
    } else if (coin.trxName === "ethereum") {
      balance = ethBalance;
      price = liveEth || 2640;
      address = UserData?.ethTokenAddress || "";
    } else if (coin.trxName === "tether") {
      balance = usdtBalance;
      price = 1;
      address = UserData?.usdtTokenAddress || "";
    }

    return {
      ...coin,
      balance,
      price,
      address,
      isAdditional: false,
    };
  });

  const additionalCoins = (newUserCoins || [])
    .filter((coin) => String(coin.coinName || "").toLowerCase() !== "euro")
    .map((coin) => {
      const trxName = coin.coinName.toLowerCase();
      return {
        slug: slugFromTrxName(trxName),
        name: coin.coinName,
        symbol: String(coin.coinSymbol || "").toUpperCase(),
        trxName,
        logo: coinLogos[trxName],
        cmcId: CMC_IDS[trxName] || "",
        accent: "#3B82F6",
        balance: getTransactionsForCoin(trxName, transactions),
        price: getCoinPrice(coin.coinSymbol),
        address: coin.tokenAddress || "",
        coinData: coin,
        isAdditional: true,
      };
    });

  return [...coreCoins, ...additionalCoins];
};

export const findCoinBySlug = (coins, slug) =>
  coins.find((coin) => coin.slug === slug);

export const filterCoinTransactions = (transactions, trxName) => {
  if (!Array.isArray(transactions) || !trxName) return [];
  return transactions
    .filter((tx) =>
      String(tx.trxName || "")
        .toLowerCase()
        .includes(String(trxName).toLowerCase())
    )
    .sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
};
