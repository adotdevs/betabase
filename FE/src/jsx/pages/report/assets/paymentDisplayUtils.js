/** Bank option label for withdraw payment dropdowns: BankName (IBAN). */
export const formatBankPaymentOptionLabel = (bank = {}) => {
  const accountName = String(bank.accountName || "").trim();
  const iban = String(bank.iban || "").trim();

  if (accountName && iban) {
    return `${accountName} (${iban})`;
  }
  if (accountName) {
    return accountName;
  }
  if (iban) {
    return iban;
  }
  return "Bank account";
};
