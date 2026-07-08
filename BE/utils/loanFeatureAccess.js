const userLink = require("../models/links");
const errorHandler = require("./errorHandler");

const LOAN_LINK_QUERY = {
  $or: [{ name: "Apply For Loan" }, { path: "/flows/apply-loan" }],
};

const isLoanFeatureEnabled = async () => {
  const link = await userLink.findOne(LOAN_LINK_QUERY);
  return Boolean(link?.enabled);
};

const assertLoanFeatureEnabled = async () => {
  const enabled = await isLoanFeatureEnabled();
  if (!enabled) {
    throw new errorHandler("Loan applications are currently not available.", 403);
  }
};

module.exports = {
  isLoanFeatureEnabled,
  assertLoanFeatureEnabled,
};
