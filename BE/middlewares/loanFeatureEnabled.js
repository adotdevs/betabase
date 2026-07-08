const catchAsyncErrors = require("./catchAsyncErrors");
const { assertLoanFeatureEnabled } = require("../utils/loanFeatureAccess");

exports.requireLoanFeatureEnabled = catchAsyncErrors(async (req, res, next) => {
  await assertLoanFeatureEnabled();
  next();
});
