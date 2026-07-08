import React from "react";
import EuroFiatAssetsRow from "../../../components/EuroFiatAssetsRow";
import { hasEuroBankAccountData } from "../../../components/euroAccountUtils";

const FiatAssetsTab = ({
  account,
  balance,
  currencyLabel = "EUR",
  onWithdraw,
}) => {
  const hasBankAccount = hasEuroBankAccountData(account);

  return (
    <EuroFiatAssetsRow
      variant="modern"
      account={account}
      balance={balance}
      currencyLabel={currencyLabel}
      hasBankAccount={hasBankAccount}
      onWithdraw={onWithdraw}
    />
  );
};

export default FiatAssetsTab;
