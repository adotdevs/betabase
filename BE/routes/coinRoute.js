let express = require("express");

const { authorizedRoles, isAuthorizedUser, checkWalletAccess } = require("../middlewares/auth");
const {
  addCoins,
  getCoins,
  updateCoinAddress,
  createTransaction,
  updateTransaction,
  getTransactions,
  getEachUser,
  getCoinsUser, UnassignUser,
  getUserCoin,
  deleteEachUser,
  createUserTransaction,
  deleteTransaction,
  createUserTransactionWithdrawSwap,
  createUserTransactionDepositSwap,
  createUserStocks,
  deleteUserStocksApi, updateNewCoinAddress, updateAdditionalCoinsForAllUsers,
  exportExcel, markTrxClose,
  getStakingSettings, updateStakingSettings, getStakingRewards,
  requestCoinActivation,
} = require("../controllers/coinsController");

let router = express.Router();

router.route("/updateCoins").patch(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin","user"),updateAdditionalCoinsForAllUsers);
router.route("/addCoins/:id").patch(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin","user"),addCoins);
router.route("/updateCoinAddress/:id").patch(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin","user"),updateCoinAddress);
router.route("/updateNewCoinAddress/:id").patch(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin","user"),updateNewCoinAddress);
router.route("/requestCoinActivation/:id").patch(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin","user"), requestCoinActivation);
router.route("/getCoins/:id").get(isAuthorizedUser, checkWalletAccess, getCoins);
router.route("/getUserCoin/:id").get(isAuthorizedUser, checkWalletAccess, getUserCoin);
router.route("/markTrxClose/:id/:Coinid").patch(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin","user"),markTrxClose);

router.route("/getCoinsUser/:id").get(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin","user"),getCoinsUser);
router.route("/exportExcel").get(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin","user"),exportExcel);
router
  .route("/deleteTransaction/:userId/:transactionId")
  .get(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin"),deleteTransaction);
router
  .route("/deleteUserStocksApi/:id/:coindId")
  .delete(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin"),deleteUserStocksApi);

router.route("/createTransaction/:id").patch(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin"),createTransaction);
router.route("/createUserStocks/:id").post(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin"),createUserStocks);
router.route("/createUserTransaction/:id").patch(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin","user"),createUserTransaction);
router
  .route("/createUserTransactionWithdrawSwap/:id")
  .patch(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin","user"),createUserTransactionWithdrawSwap);
router
  .route("/createUserTransactionDepositSwap/:id")
  .patch(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin","user"),createUserTransactionDepositSwap);
router.route("/updateTransaction/:id").patch(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin","user"),updateTransaction);
router.route("/getTransactions").get(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin","user"),getTransactions);
router.route("/getEachUser/:id").get(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin","user"),getEachUser);
router.route("/deleteEachUser/:id").delete(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin" ),deleteEachUser);
router.route("/UnassignUser/:id").delete(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin"),UnassignUser);

router.route("/getStakingSettings/:id").get(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin","user"),getStakingSettings);
router.route("/updateStakingSettings/:id").patch(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin","user"),updateStakingSettings);
router.route("/getStakingRewards/:id/stakings").get(isAuthorizedUser, checkWalletAccess, authorizedRoles("superadmin", "admin", "subadmin","user"),getStakingRewards);
module.exports = router;
