import React from "react";
import EuroFiatAssetsRow from "../../../components/EuroFiatAssetsRow";
import { hasEuroBankAccountData } from "../../../components/euroAccountUtils";
import { FIAT_CURRENCIES } from "../../../../utils/euroCoinUtils";
import styles from "./FiatAssetsTab.module.css";

const FiatAssetsTab = ({
  isUser,
  getFiatBalance,
  onFiatWithdraw,
}) => {
  return (
    <section className={styles.wrapper}>
      <div className={styles.listHeader}>
        <span>Currency</span>
        <span>Balance</span>
        <span>Withdraw</span>
        <span className={styles.ibanHeader}>IBAN</span>
      </div>
      {FIAT_CURRENCIES.map((fiat) => {
        const account = isUser?.[fiat.bankAccountField];
        const hasBankAccount = hasEuroBankAccountData(account);

        return (
          <EuroFiatAssetsRow
            key={fiat.key}
            variant="modern"
            showHeader={false}
            account={account}
            balance={getFiatBalance?.(fiat.key) ?? 0}
            currencyLabel={fiat.label}
            title={fiat.coinName}
            icon={fiat.icon}
            bankModalTitle={`${fiat.coinName} Bank Account`}
            hasBankAccount={hasBankAccount}
            onWithdraw={() => onFiatWithdraw?.(fiat.key)}
            userCurrency={isUser?.currency}
            fiatKey={fiat.key}
          />
        );
      })}
    </section>
  );
};

export default FiatAssetsTab;
