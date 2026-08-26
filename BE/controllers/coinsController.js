let userCoins = require("../models/userCoins");
const errorHandler = require("../utils/errorHandler");

const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const jwtToken = require("../utils/jwtToken");
const userModel = require("../models/userModel");
const sendEmail = require("../utils/sendEmail");
const { getLatestCoinPrices, getCryptoNews } = require("../utils/coinPriceService");
const { assertSufficientAvailableBalance } = require("../utils/availableBalance");
const {
  getAssignedSubAdminIds,
  syncAssignedSubAdmins,
} = require("../utils/subAdminAssignment");
let notificationSchema = require("../models/notifications");

const XLSX = require("xlsx");

const canEditWalletAddress = (user) => {
  if (!user) return false;
  if (user.role === "superadmin") return true;
  if (user.role === "admin") return user.adminPermissions?.editWalletAddress === true;
  if (user.role === "subadmin") return user.permissions?.editWalletAddress === true;
  return false;
};

const defaultAdditionalCoins = [
  { coinName: "BNB", coinSymbol: "bnb", balance: 0, tokenAddress: "", activationStatus: "inactive" },
  { coinName: "XRP", coinSymbol: "xrp", balance: 0, tokenAddress: "", activationStatus: "inactive" },
  { coinName: "Dogecoin", coinSymbol: "doge", balance: 0, tokenAddress: "", activationStatus: "inactive" },
  { coinName: "Toncoin", coinSymbol: "ton", balance: 0, tokenAddress: "", activationStatus: "inactive" },
  { coinName: "Chainlink", coinSymbol: "link", balance: 0, tokenAddress: "", activationStatus: "inactive" },
  { coinName: "Polkadot", coinSymbol: "dot", balance: 0, tokenAddress: "", activationStatus: "inactive" },
  { coinName: "Near Protocol", coinSymbol: "near", balance: 0, tokenAddress: "", activationStatus: "inactive" },
  { coinName: "USD Coin", coinSymbol: "usdc", balance: 0, tokenAddress: "", activationStatus: "inactive" },
  { coinName: "Tron", coinSymbol: "trx", balance: 0, tokenAddress: "", activationStatus: "inactive" },
  { coinName: "Solana", coinSymbol: "sol", balance: 0, tokenAddress: "", activationStatus: "inactive" },
  { coinName: "Euro", coinSymbol: "eur", balance: 0, tokenAddress: "", activationStatus: "inactive" },
  { coinName: "Dollar", coinSymbol: "usd", balance: 0, tokenAddress: "", activationStatus: "inactive" },
  { coinName: "Swiss Franc", coinSymbol: "chf", balance: 0, tokenAddress: "", activationStatus: "inactive" },
  { coinName: "Danish Krone", coinSymbol: "dkk", balance: 0, tokenAddress: "", activationStatus: "inactive" },
];

const FIAT_TRX_NAMES = new Set(["Euro", "Dollar", "Swiss Franc", "Danish Krone"]);

const isFiatTrxName = (trxName) => FIAT_TRX_NAMES.has(String(trxName || "").trim());

const repairLegacyTransactions = async (doc) => {
  if (!doc?.transactions?.length) return doc;

  let changed = false;
  for (const tx of doc.transactions) {
    if (!tx.withdraw) {
      tx.withdraw = "admin";
      changed = true;
    }
    if (tx.txId == null) {
      tx.txId = "";
      changed = true;
    }
  }

  if (!changed) return doc;

  await userCoins.updateOne(
    { _id: doc._id },
    { $set: { transactions: doc.transactions } },
    { runValidators: false }
  );

  return userCoins.findOne({ _id: doc._id });
};

const CORE_COIN_ACTIVATION = {
  bitcoin: {
    addressField: "btcTokenAddress",
    statusField: "btcActivationStatus",
    label: "Bitcoin",
  },
  ethereum: {
    addressField: "ethTokenAddress",
    statusField: "ethActivationStatus",
    label: "Ethereum",
  },
  tether: {
    addressField: "usdtTokenAddress",
    statusField: "usdtActivationStatus",
    label: "Tether",
  },
};

const resolveActivationStatus = (address, storedStatus) => {
  if (String(address || "").trim()) return "active";
  if (storedStatus === "pending") return "pending";
  return "inactive";
};
exports.updateAdditionalCoinsForAllUsers = async () => {
  try {
    // Connect to the database


    // Fetch all user coins
    const users = await userCoins.find();

    for (const user of users) {
      // Get current additionalCoins
      const currentCoins = user.additionalCoins.map((coin) => coin.coinSymbol);

      // Find missing coins
      const missingCoins = defaultAdditionalCoins.filter(
        (defaultCoin) => !currentCoins.includes(defaultCoin.coinSymbol)
      );

      // Add missing coins
      if (missingCoins.length > 0) {
        await userCoins.findByIdAndUpdate(
          user._id,
          { $push: { additionalCoins: { $each: missingCoins } } },
          { runValidators: false }
        );
      }
    }
 
  } catch (error) {
    console.error("Error updating users:", error);
  } finally {
  }
};
exports.addCoins = catchAsyncErrors(async (req, res, next) => {
  let { id } = req.params;

  let existing = await userCoins.findOne({ user: id });
  existing = await repairLegacyTransactions(existing);

  if (!existing) {
    let newCoin = await userCoins.create({ user: id });

    return res.status(200).send({
      success: true,
      msg: "Created",
      createCoin: newCoin,
    });
  }

  const currentSymbols = existing.additionalCoins.map((coin) => coin.coinSymbol);
  const missingCoins = defaultAdditionalCoins.filter(
    (defaultCoin) => !currentSymbols.includes(defaultCoin.coinSymbol)
  );

  if (missingCoins.length > 0) {
    await userCoins.findByIdAndUpdate(
      existing._id,
      { $push: { additionalCoins: { $each: missingCoins } } },
      { new: true, runValidators: false }
    );
    existing = await userCoins.findOne({ user: id });
  }

  res.status(200).send({
    success: true,
    msg: missingCoins.length > 0 ? "Missing coins added" : "Already exists",
    createCoin: existing,
  });
});

exports.getCoins = catchAsyncErrors(async (req, res, next) => {
  let { id } = req.params;
  let getCoin = await userCoins.findOne({ user: id });
  const prices = await getLatestCoinPrices();

  res.status(200).send({
    success: true,
    msg: "Done",
    getCoin,
    ...prices,
  });
});
exports.exportExcel = catchAsyncErrors(async (req, res, next) => {

  let getCoin = await userCoins.find();

  const worksheet = XLSX.utils.json_to_sheet(getCoin);

  // Create a new workbook and append the worksheet
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

  // Write to buffer
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

  // Send file to client
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=data.xlsx"
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );


  res.status(200).send({
    success: true,
    msg: "Done",
    buffer,

  });

});
// export 

// Sample JSON data (Replace this with your MongoDB data)



// 
exports.getUserCoin = catchAsyncErrors(async (req, res, next) => {
  let { id } = req.params;
  let getCoin = await userCoins.findOne({ user: id });
  const prices = await getLatestCoinPrices();

  res.status(200).send({
    success: true,
    msg: "Done",
    getCoin,
    ...prices,
  });
});
exports.getCoinsUser = catchAsyncErrors(async (req, res, next) => {
  let { id } = req.params;
  const prices = await getLatestCoinPrices();
  let getCoin = await userCoins.findOne({ user: id });

  res.status(200).send({
    success: true,
    msg: "Dones",
    ...prices,
    getCoin,
  });
});

exports.getCryptoNews = catchAsyncErrors(async (req, res) => {
  const news = await getCryptoNews();

  res.status(200).send({
    success: true,
    msg: "Done",
    source: news.source,
    news: news.items || [],
  });
});
exports.updateCoinAddress = catchAsyncErrors(async (req, res, next) => {
  if (req.user?.role !== "user" && !canEditWalletAddress(req.user)) {
    return next(new errorHandler("You do not have permission to edit wallet addresses", 403));
  }

  let { id } = req.params;
  let { usdtTokenAddress, ethTokenAddress, btcTokenAddress } = req.body;

  const updatePayload = {
    usdtTokenAddress,
    ethTokenAddress,
    btcTokenAddress,
  };

  if (String(btcTokenAddress || "").trim()) {
    updatePayload.btcActivationStatus = "active";
  }
  if (String(ethTokenAddress || "").trim()) {
    updatePayload.ethActivationStatus = "active";
  }
  if (String(usdtTokenAddress || "").trim()) {
    updatePayload.usdtActivationStatus = "active";
  }

  let getCoin = await userCoins.findOneAndUpdate(
    { user: id },
    updatePayload,
    {
      new: true,
    }
  );
  res.status(200).send({
    success: true,
    msg: "Address Updated successfully",
    getCoin,
  });
});
exports.updateNewCoinAddress = catchAsyncErrors(async (req, res, next) => {
  if (req.user?.role !== "user" && !canEditWalletAddress(req.user)) {
    return next(new errorHandler("You do not have permission to edit wallet addresses", 403));
  }

  const { id } = req.params; // User ID from params
  const { coinSymbol, address } = req.body.newCoinAddress; // Destructure from body
 

  // Validate input
  if (!coinSymbol || !address) {
    return next(new errorHandler("Please fill all the required fields", 400));
  }

  // Fetch user's coin data
  const userCoinsData = await userCoins.findOne({ user: id });
 
  if (!userCoinsData) {
    return next(new errorHandler("User not found", 404));
  }

  // Find the specific coin to update
  const coinToUpdate = userCoinsData.additionalCoins.find(coin => coin.coinSymbol.toLowerCase() === coinSymbol.toLowerCase());

  // If the coin is not found, create a new coin object
  if (!coinToUpdate) {
    const newCoin = {
      coinName: coinSymbol.charAt(0).toUpperCase() + coinSymbol.slice(1), // Capitalize the coin name
      coinSymbol: coinSymbol.toLowerCase(),
      balance: 0, // Default balance
      tokenAddress: address, // Set the provided address
      activationStatus: "active",
    };

    // Update userCoinsData to include the new coin
    userCoinsData.additionalCoins.push(newCoin); // Add the new coin to the array
  } else {
    // If the coin is found, update the token address
    coinToUpdate.tokenAddress = address;
    coinToUpdate.activationStatus = "active";
  }

  // Save the updated document
  await userCoinsData.save({ validateBeforeSave: false }); // Bypass validation for transactions

  res.status(200).json({
    success: true,
    msg: "Address updated successfully",
    updatedCoin: coinToUpdate ? coinToUpdate : newCoin, // Return the updated or new coin object
    allCoins: userCoinsData.additionalCoins // Return all additionalCoins
  });
});

exports.requestCoinActivation = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { trxName, coinSymbol } = req.body;

  if (!trxName && !coinSymbol) {
    return next(new errorHandler("Coin identifier is required", 400));
  }

  const signleUser = await userModel.findById(id);
  if (!signleUser) {
    return next(new errorHandler("User not found", 404));
  }

  const userCoinsData = await userCoins.findOne({ user: id });
  if (!userCoinsData) {
    return next(new errorHandler("Wallet not found", 404));
  }

  const normalizedTrx = String(trxName || "").toLowerCase();
  const coreCoin = CORE_COIN_ACTIVATION[normalizedTrx];
  let coinLabel = "";

  if (coreCoin) {
    const currentAddress = userCoinsData[coreCoin.addressField];
    const currentStatus = resolveActivationStatus(
      currentAddress,
      userCoinsData[coreCoin.statusField]
    );

    if (currentStatus === "active") {
      return next(new errorHandler("This wallet is already active", 400));
    }

    if (currentStatus === "pending") {
      return res.status(200).json({
        success: true,
        msg: "Activation request is already in progress",
        activationStatus: "pending",
      });
    }

    userCoinsData[coreCoin.statusField] = "pending";
    coinLabel = coreCoin.label;
  } else {
    const coinToUpdate = userCoinsData.additionalCoins.find(
      (coin) =>
        String(coin.coinSymbol || "").toLowerCase() ===
          String(coinSymbol || "").toLowerCase() ||
        String(coin.coinName || "").toLowerCase() === normalizedTrx
    );

    if (!coinToUpdate) {
      return next(new errorHandler("Coin not found", 404));
    }

    const currentStatus = resolveActivationStatus(
      coinToUpdate.tokenAddress,
      coinToUpdate.activationStatus
    );

    if (currentStatus === "active") {
      return next(new errorHandler("This wallet is already active", 400));
    }

    if (currentStatus === "pending") {
      return res.status(200).json({
        success: true,
        msg: "Activation request is already in progress",
        activationStatus: "pending",
      });
    }

    coinToUpdate.activationStatus = "pending";
    coinLabel = coinToUpdate.coinName;
  }

  await userCoinsData.save({ validateBeforeSave: false });

  await notificationSchema.create({
    userId: signleUser._id,
    type: "coin_activation_request",
    content: `${signleUser.firstName} ${signleUser.lastName} requested wallet activation for ${coinLabel}.`,
    status: "pending",
    userEmail: signleUser.email,
    userName: `${signleUser.firstName} ${signleUser.lastName}`,
  });

  res.status(200).json({
    success: true,
    msg: "Activation request submitted.",
    activationStatus: "pending",
  });

  const url = `${process.env.BASE_URL}/admin/users/${signleUser._id}/assets`;
  const subject = "New Coin Activation Request";
  const text = `Hi there,

A user requested wallet activation. Details below:

Name: ${signleUser.firstName} ${signleUser.lastName}
Email: ${signleUser.email}
Coin: ${coinLabel}

Review and add the wallet address here:
${url}

Best regards,
${process.env.WebName} Team`;

  sendEmail(process.env.USER, subject, text).catch((err) =>
    console.error("Coin activation email send error:", err)
  );
});



exports.createTransaction = catchAsyncErrors(async (req, res, next) => {
  let { id } = req.params;
  let {
    trxName,
    amount,
    txId,
    fromAddress,
    status,
    type, Staking,
    note, reference,
    ethBalance,
    btcBalance,
    usdtBalance,
    subjectLine, stakingData,
    lastProfitDate,
    totalProfit
  } = req.body;

  if (!trxName || !amount || !status ||
    (!isFiatTrxName(trxName) && (!txId || !fromAddress))) {
    return next(new errorHandler("Please fill all the required fields", 500));
  }

  const transactionPayload = {
    trxName,
    amount,
    txId: txId || "",
    type,
    fromAddress: fromAddress || "",
    status,
    note,
    reference,
    withdraw: "admin",
    ...(Staking ? { stakingData, lastProfitDate, totalProfit } : {}),
  };

  let Transaction;
  if (Staking) {
    Transaction = await userCoins.findOneAndUpdate(
      { user: id },
      {
        $push: {
          transactions: transactionPayload,
          ethBalance,
          btcBalance,
          usdtBalance,
        },
      },
      {
        new: true,
        upsert: true,
      }
    );
  } else {
    Transaction = await userCoins.findOneAndUpdate(
      { user: id },
      {
        $push: {
          transactions: transactionPayload,
          ethBalance,
          btcBalance,
          usdtBalance,
        },
      },
      {
        new: true,
        upsert: true,
      }
    );
  }

  let user = await userModel.findById({ _id: id })
  res.status(200).send({
    success: true,
    msg: "Transaction created successfully",
    Transaction,
  });
  note = note ? note.trim() : "";
  if (note) {
    let subject = `${subjectLine}`;
    let text = `

${note}
  
Best Regards,
${process.env.WebName} TEAM`;
    // 
    let sendEmailError = await sendEmail(user.email, subject, text);

  }

});
exports.createNewTransaction = catchAsyncErrors(async (req, res, next) => {
  let { id } = req.params;
  let {
    trxName,
    amount,
    txId,
    fromAddress,
    status,
    type,
    note, reference,
    ethBalance,
    btcBalance,
    usdtBalance,
  } = req.body;
  if (!trxName || !amount || !txId || !status || !fromAddress) {
    return next(new errorHandler("Please fill all the required fields", 500));
  }
  let Transaction = await userCoins.findOneAndUpdate(
    { user: id },
    {
      $push: {
        transactions: {
          trxName,
          amount,
          txId,
          type,
          fromAddress,
          status,
          note, reference,
        },
        ethBalance,
        btcBalance,
        usdtBalance,
      },
    },
    {
      new: true,
      upsert: true,
    }
  );

  res.status(200).send({
    success: true,
    msg: "Transaction created successfully",
    Transaction,
  });
});
exports.createUserStocks = catchAsyncErrors(async (req, res, next) => {
  let { id } = req.params;
  let {
    stockName,
    stockSymbol,
    stockAmount,
    stockValue,

  } = req.body;
  if (!stockName || !stockSymbol || !stockAmount || !stockValue) {
    return next(new errorHandler("Please fill all the required fields", 500));
  }
  let StocksUpdate = await userCoins.findOneAndUpdate(
    { user: id },
    {
      $push: {
        stocks: {
          stockName,
          stockSymbol,
          stockAmount,
          stockValue,
        },
      },
    },
    {
      new: true,
      upsert: true,
    }
  );
  res.status(200).send({
    success: true,
    msg: "Stocks Updated successfully",
    StocksUpdate,
  });
});
exports.deleteUserStocksApi = catchAsyncErrors(async (req, res, next) => {
  const { id, coindId } = req.params; // User ID
  // The specific stock's ID or identifier

  // Check if stockId is provided
  if (!coindId) {
    return next(new errorHandler("Stock ID is required for deletion", 400));
  }

  // Find the user and pull (remove) the specific stock from the array
  let StocksUpdate = await userCoins.findOneAndUpdate(
    { user: id },
    {
      $pull: {
        stocks: { _id: coindId } // Assuming each stock has a unique _id
      }
    },
    {
      new: true
    }
  );

  // If no user is found or no stock removed
  if (!StocksUpdate) {
    return next(new errorHandler("No stock found with the provided ID", 404));
  }

  res.status(200).send({
    success: true,
    msg: "Stock deleted successfully",
    StocksUpdate
  });
});


exports.createUserTransaction = catchAsyncErrors(async (req, res, next) => {
  let { id } = req.params;
  let { trxName, amount, txId, selectedPayment, e, status, tradingTime, type, notification, Staking, stakingData, startDate, lastProfitDate, totalProfit, isTrading, profit } = req.body;


  // Default status to "pending" if not provided
  status = status || "pending";
  type = type || "withdraw";
  let by = "user";
  if (!trxName || !amount) {
    return next(new errorHandler("Please fill all the required fields", 500));
  }
  let signleUser = await userModel.findById({ _id: id })
  if (Number(amount) < 0) {
    const wallet = await userCoins.findOne({ user: id });
    const balanceCheck = assertSufficientAvailableBalance(
      wallet?.transactions,
      trxName,
      amount
    );
    if (!balanceCheck.ok) {
      return next(new errorHandler(balanceCheck.message, 400));
    }
  }
  let Transaction;
  if (Staking) {
    Transaction = await userCoins.findOneAndUpdate(
      { user: id },
      {
        $push: {
          transactions: {
            withdraw: e || "crypto",
            selectedPayment: selectedPayment,
            trxName,
            amount,
            txId: txId || "",
            type,
            status,
            by,
            tradingTime,
            stakingData,
            totalProfit,
            lastProfitDate,

          },
        },
      },
      {
        new: true,
        upsert: true,
      }
    );
  }

  else if (isTrading) {
    const utcNow = new Date().toISOString(); // Always correct UTC time from server

    Transaction = await userCoins.findOneAndUpdate(
      { user: id },
      {
        $push: {
          transactions: {
            withdraw: e || "crypto",
            selectedPayment: selectedPayment,
            trxName,
            amount,
            txId: txId || "",
            type,
            status,
            by,
            tradingTime,
            lastProfitDate: utcNow,  // set UTC
            totalProfit,
            isTrading,
            startDate: utcNow,       // set UTC
            dailyProfits: {
              profit,
              date: utcNow           // set UTC
            }
          },
        },
      },
      {
        new: true,
        upsert: true,
      }
    );
  }

  else {
    Transaction = await userCoins.findOneAndUpdate(
      { user: id },
      {
        $push: {
          transactions: {
            withdraw: e || "bank",
            selectedPayment: selectedPayment,
            trxName,
            amount,
            txId: txId || "",
            type,
            status,
            by,
            tradingTime
          },
        },
      },
      {
        new: true,
        upsert: true,
      }
    );
  }

  if (notification) {
    await notificationSchema.create({
      userId: signleUser._id,
      type: "withdraw_request",
      content: `You have a new withdraw request of ${trxName} from ${signleUser.firstName}  ${signleUser.lastName}.`,

      userEmail: signleUser.email,
      userName: `${signleUser.firstName} ${signleUser.lastName}`
    });

    // 
  }

  res.status(200).send({
    success: true,
    msg: "Transaction created successfully",
    Transaction,
  });
  if (notification) {
    const url = `${process.env.BASE_URL}/admin/users/${signleUser._id}/transactions`
    let subject = `New Withdraw Request `;
    let text = `Hi there,
    
A user opened a new withdraw request, below are the details:
Name: ${signleUser.firstName}  ${signleUser.lastName}
Email: ${signleUser.email}
    
Click the below link to check the request:
    
${url}
    
Best regards,  
${process.env.WebName} Team`;
    // don't await, just run in background
    sendEmail(process.env.USER, subject, text)
      .catch(err => console.error("Email send error:", err));
  }
});
exports.markTrxClose = catchAsyncErrors(async (req, res, next) => {
  const { id, Coinid } = req.params;

  // Find only the matched transaction in the user's transactions array
  const userCoinsDoc = await userCoins.findOne(
    {
      user: id,
      "transactions._id": Coinid
    },
    {
      "transactions.$": 1  // Only the matched transaction
    }
  );

  if (!userCoinsDoc || !userCoinsDoc.transactions || userCoinsDoc.transactions.length === 0) {
    return next(new errorHandler("Transaction not found", 404));
  }


  // Update the status of that transaction
  const updatedDoc = await userCoins.findOneAndUpdate(
    {
      user: id,
      "transactions._id": Coinid
    },
    {
      $set: {
        "transactions.$.tradingStatus": "closed",
        "transactions.$.isTrading": false,
        "transactions.$.closedAt": new Date()
      }
    },
    {
      new: true,

    }
  );

  res.status(200).json({
    success: true,
    msg: "Transaction status updated to closed",
    data: updatedDoc.transactions[0]  // return only the updated transaction
  });
});

exports.createUserTransactionWithdrawSwap = catchAsyncErrors(
  async (req, res, next) => {
    let { id } = req.params;
    let { trxName, amount, txId, fromAddress, status, type, isHidden, note } =
      req.body;

    try {
      if (Number(amount) < 0) {
        const wallet = await userCoins.findOne({ user: id });
        const balanceCheck = assertSufficientAvailableBalance(
          wallet?.transactions,
          trxName,
          amount
        );
        if (!balanceCheck.ok) {
          return next(new errorHandler(balanceCheck.message, 400));
        }
      }

      let newTransactionWithdraw = await userCoins.findOneAndUpdate(
        { user: id },
        {
          $push: {
            transactions: {
              trxName,
              amount,
              txId,
              fromAddress,
              status,
              type,
              note,
              withdraw: "crypto",
              isHidden: true,
            },
          },
        },
        {
          new: true,
          upsert: true,
        }
      );
      // Withdraw transaction

      res.status(200).send({
        success: true,
        newTransactionWithdraw,
      });
    } catch (error) {
      return next(new errorHandler(error.message, 500));
    }
  }
);
exports.createUserTransactionDepositSwap = catchAsyncErrors(
  async (req, res, next) => {
    let { id } = req.params;
    let { trxName, amount, txId, fromAddress, status, type, isHidden, note } =
      req.body;

    try {
      let newTransactionDeposit = await userCoins.findOneAndUpdate(
        { user: id },
        {
          $push: {
            transactions: {
              trxName,
              amount,
              txId,
              fromAddress,
              status,
              type,
              note,
              withdraw: "crypto",
              isHidden: true,
            },
          },
        },
        {
          new: true,
          upsert: true,
        }
      );
      // Withdraw transaction

      res.status(200).send({
        success: true,
        msg: "Coins Convreted successfully",

        newTransactionDeposit,
      });
    } catch (error) {
      return next(new errorHandler(error.message, 500));
    }
  }
);

// exports.createUserTransactionSwap = catchAsyncErrors(async (req, res, next) => {
//   let { id } = req.params;
//   // let { trxName, amount, txId, selectedPayment, e } = req.body;
//   // let status = "pending";
//   // let type = "withdraw";
//   // let by = "user";
//   // if (!trxName || !amount) {
//   //   return next(new errorHandler("Please fill all the required fields", 500));
//   // }
//   // let Transaction = await userCoins.findOneAndUpdate(
//   //   { user: id },
//   //   {
//   //     $push: {
//   //       transactions: {
//   //         withdraw: e,
//   //         selectedPayment: selectedPayment,
//   //         trxName,
//   //         amount,
//   //         txId,
//   //         type,
//   //         status,
//   //         by,
//   //       },
//   //     },
//   //   },
//   //   {
//   //     new: true,
//   //     upsert: true,
//   //   }
//   // );
//   // res.status(200).send({
//   //   success: true,
//   //   msg: "Transaction created successfully",
//   //   Transaction,
//   // });
// });
exports.getTransactions = catchAsyncErrors(async (req, res, next) => {
  let Transaction = await userCoins
    .find()
    .populate("user", "email firstName lastName");
  const prices = await getLatestCoinPrices();

  res.status(200).send({
    success: true,
    msg: " ",
    Transaction,
    ...prices,
  });
});
exports.getEachUser = catchAsyncErrors(async (req, res, next) => {
  let { id } = req.params;

  let getCoin = await userCoins.findOne({ "transactions._id": req.params.id });

  let signleUser = await userModel.findById({ _id: getCoin.user });
  if (signleUser) {
    res.status(200).send({
      success: true,
      signleUser,
    });
  }
});
exports.deleteEachUser = catchAsyncErrors(async (req, res, next) => {
  let { id } = req.params;
  let getCoin = await userCoins.findOneAndDelete({ user: id });
  let signleUser = await userModel.findByIdAndDelete({ _id: id });

  if (!signleUser) {
    res.status(200).send({
      success: false,
      msg: "User not found or already has been deleted",
    });
  }
  res.status(200).send({
    success: true,
    msg: "User has been deleted successfully",
    // getCoin,
  });
});
exports.UnassignUser = catchAsyncErrors(async (req, res, next) => {
  let { id } = req.params;
  let signleUser = await userModel.findById({ _id: id });

  if (!signleUser) {
    return res.status(200).send({
      success: false,
      msg: "User not found or already has been unasssigned",
    });
  }

  const subAdminId = req.query.subAdminId || req.body?.subAdminId;
  if (subAdminId) {
    const remaining = getAssignedSubAdminIds(signleUser).filter(
      (assignedId) => assignedId !== String(subAdminId)
    );
    syncAssignedSubAdmins(signleUser, remaining);
  } else {
    syncAssignedSubAdmins(signleUser, []);
  }
  await signleUser.save();

  if (signleUser.isShared) {
    return res.status(200).send({
      success: true,
      msg: "User has been unasssigned successfully, but its shared globally to all sub admins",
    });
  }
  res.status(200).send({
    success: true,
    msg: "User has been unasssigned successfully",
  });
});

const ADMIN_TX_FIELDS = [
  "tradingStatus",
  "closedAt",
  "withdraw",
  "selectedPayment",
  "trxName",
  "amount",
  "txId",
  "tradingTime",
  "startDate",
  "lastProfitDate",
  "totalProfit",
  "isTrading",
  "fromAddress",
  "status",
  "type",
  "note",
  "reference",
  "createdAt",
  "isHidden",
  "by",
];

const STAKING_TX_FIELDS = [
  "isStaking",
  "duration",
  "interestRate",
  "expectedReward",
  "actualReward",
  "stakingStart",
  "stakingEnd",
  "isRewardDistributed",
  "rewardDistributionDate",
  "stakingType",
  "coin",
  "status",
];

const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toDateOrNull = (value) => {
  if (value === null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const signedTxAmount = (amount, type) => {
  const n = toFiniteNumber(amount);
  if (n === null) return null;
  return String(type || "").toLowerCase() === "withdraw" ? -Math.abs(n) : Math.abs(n);
};

exports.updateTransaction = catchAsyncErrors(async (req, res, next) => {
  const role = req.user?.role;
  if (!["superadmin", "admin", "subadmin"].includes(role)) {
    return next(new errorHandler("Not allowed to update transactions", 403));
  }

  const transactionId = req.body._id || req.params.id;
  if (!transactionId) {
    return next(new errorHandler("Transaction id is required", 400));
  }

  const existing = await userCoins.findOne(
    { "transactions._id": transactionId },
    { "transactions.$": 1 }
  );
  const current = existing?.transactions?.[0];
  if (!current) {
    return next(new errorHandler("Transaction not found", 404));
  }

  const $set = {};

  const nextType = req.body.type !== undefined ? req.body.type : current.type;
  if (req.body.type !== undefined) {
    const type = String(req.body.type).toLowerCase();
    if (!["deposit", "withdraw"].includes(type)) {
      return next(new errorHandler("Type must be deposit or withdraw", 400));
    }
    $set["transactions.$.type"] = type;
  }

  if (req.body.amount !== undefined || req.body.type !== undefined) {
    const signed = signedTxAmount(
      req.body.amount !== undefined ? req.body.amount : current.amount,
      nextType
    );
    if (signed === null) {
      return next(new errorHandler("Amount must be a valid number", 400));
    }
    $set["transactions.$.amount"] = signed;
  }

  if (req.body.withdraw !== undefined) {
    const withdraw = String(req.body.withdraw).toLowerCase();
    if (!["crypto", "bank", "admin"].includes(withdraw)) {
      return next(new errorHandler("Invalid withdraw method", 400));
    }
    $set["transactions.$.withdraw"] = withdraw;
  }

  for (const key of ADMIN_TX_FIELDS) {
    if (["amount", "type", "withdraw"].includes(key)) continue;
    if (req.body[key] === undefined) continue;

    let value = req.body[key];
    if (key === "isHidden" || key === "isTrading") {
      value = value === true || value === "true" || value === "1";
    } else if (["createdAt", "closedAt", "startDate", "lastProfitDate"].includes(key)) {
      const parsed = toDateOrNull(value);
      if (parsed === undefined) {
        return next(new errorHandler(`Invalid date for ${key}`, 400));
      }
      value = parsed;
    } else if (["totalProfit"].includes(key)) {
      const n = toFiniteNumber(value);
      if (n === null) {
        return next(new errorHandler("Total profit must be a valid number", 400));
      }
      value = n;
    } else if (key === "status") {
      value = String(value || "").trim();
      if (!value) {
        return next(new errorHandler("Status is required", 400));
      }
    } else if (key === "trxName") {
      value = String(value || "").trim();
      if (!value) {
        return next(new errorHandler("Asset is required", 400));
      }
    }

    $set[`transactions.$.${key}`] = value;
  }

  if (req.body.stakingData && typeof req.body.stakingData === "object") {
    for (const key of STAKING_TX_FIELDS) {
      if (req.body.stakingData[key] === undefined) continue;
      let value = req.body.stakingData[key];
      if (key === "isStaking" || key === "isRewardDistributed") {
        value = value === true || value === "true" || value === "1";
      } else if (
        ["stakingStart", "stakingEnd", "rewardDistributionDate"].includes(key)
      ) {
        const parsed = toDateOrNull(value);
        if (parsed === undefined) {
          return next(new errorHandler(`Invalid staking date for ${key}`, 400));
        }
        value = parsed;
      } else if (
        ["duration", "interestRate", "expectedReward", "actualReward"].includes(key)
      ) {
        const n = toFiniteNumber(value);
        if (n === null) continue;
        value = n;
      }
      $set[`transactions.$.stakingData.${key}`] = value;
    }
  }

  if (Object.keys($set).length === 0) {
    return next(new errorHandler("No valid fields to update", 400));
  }

  const result = await userCoins.updateOne(
    { "transactions._id": transactionId },
    { $set }
  );

  if (!result.matchedCount) {
    return next(new errorHandler("Transaction not found", 404));
  }

  res.status(200).send({
    success: true,
    msg: "Transaction updated successfully",
  });
});
exports.deleteTransaction = catchAsyncErrors(async (req, res, next) => {
  const { userId, transactionId } = req.params;

  // Assuming userCoins is your collection model
  const deletedTransaction = await userCoins.findOneAndUpdate(
    { user: userId },
    { $pull: { transactions: { _id: transactionId } } },
    { new: true }
  );

  if (!deletedTransaction) {
    return res.status(404).json({
      success: false,
      msg: "Transaction not found or already deleted",
    });
  }

  res.status(200).json({
    success: true,
    msg: "Transaction deleted successfully",
    deletedTransaction,
  });
});

exports.getStakingSettings = catchAsyncErrors(async (req, res, next) => {
  try {
    const userCoin = await userCoins.findOne({ user: req.params.id });
    if (!userCoin) {
      return res.status(404).json({ success: false, msg: 'User not found' });
    }



    res.status(201).json({
      success: true,
      stakingSettings: userCoin.stakingSettings,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
});
exports.updateStakingSettings = catchAsyncErrors(async (req, res, next) => {
  try {
    const { disabledCoins, customRates } = req.body;

    const userCoin = await userCoins.findOne({ user: req.params.id });
    if (!userCoin) {
      return res.status(404).json({ success: false, msg: 'User not found' });
    }

    userCoin.stakingSettings = {
      disabledCoins: disabledCoins || [],
      customRates: customRates || {}
    };
    await userCoin.save({ validateModifiedOnly: true });


    res.status(201).json({
      success: true,
      msg: 'Staking settings updated successfully',
      stakingSettings: userCoin.stakingSettings
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
});
exports.getStakingRewards = catchAsyncErrors(async (req, res, next) => {
  try {
    const userCoinsData = await userCoins.findOne({ user: req.params.id }).populate('user')
      ;

    if (!userCoinsData) {
      return res.status(404).json({ success: false, msg: 'User not found' });
    }

    const stakings = userCoinsData.transactions.filter(t => t.stakingData && t.stakingData.isStaking);

    res.status(201).json({
      success: true,
      stakings
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
});