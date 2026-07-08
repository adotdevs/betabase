export const EURO_ACCOUNT_FIELDS = [
  { key: "bankName", label: "Bank Name" },
  { key: "beneficiaryName", label: "Beneficiary Name" },
  { key: "accountNumber", label: "Account Number" },
  { key: "iban", label: "IBAN" },
  { key: "bankAddress", label: "Bank Address" },
];

export const hasEuroBankAccountData = (account) => {
  if (!account) return false;
  return EURO_ACCOUNT_FIELDS.some(({ key }) => String(account[key] || "").trim());
};

/** @deprecated use hasEuroBankAccountData */
export const hasCompleteEuroBankAccount = hasEuroBankAccountData;

export const getVisibleEuroFields = (account) =>
  EURO_ACCOUNT_FIELDS.filter(({ key }) => String(account?.[key] || "").trim()).map(({ key, label }) => ({
    key,
    label,
    value: String(account[key]).trim(),
  }));
