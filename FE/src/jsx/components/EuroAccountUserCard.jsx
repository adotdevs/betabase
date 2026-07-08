import React, { useState } from "react";
import EurIco from "../../assets/images/new/euro.svg";
import EuroBankDetailsModal from "./EuroBankDetailsModal";
import styles from "./EuroAccountUserCard.module.css";
import { hasEuroBankAccountData } from "./euroAccountUtils";

export { EURO_ACCOUNT_FIELDS, hasEuroBankAccountData, hasCompleteEuroBankAccount } from "./euroAccountUtils";

const getCardSubtitle = (account) => {
  const parts = [account?.beneficiaryName, account?.bankName]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : "Your euro transfer details";
};

const EuroAccountUserCard = ({ account, variant = "default", className = "" }) => {
  const [open, setOpen] = useState(false);

  if (!hasEuroBankAccountData(account)) {
    return null;
  }

  const cardClassName = [
    styles.cardWrap,
    variant === "assets" ? styles.assetsRow : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div className={cardClassName}>
        <div className={`${styles.cardInner} ${variant === "compact" ? styles.cardInnerCompact : ""}`}>
          <div className={styles.cardLeft}>
            <div className={styles.iconBadge}>
              <img src={EurIco} alt="Euro account" />
            </div>
            <div className={styles.cardText}>
              <h3 className={styles.cardTitle}>Euro Account</h3>
              <p className={styles.cardSubtitle}>{getCardSubtitle(account)}</p>
            </div>
          </div>
          <button type="button" className={styles.viewBtn} onClick={() => setOpen(true)}>
            View Bank Details
          </button>
        </div>
      </div>

      <EuroBankDetailsModal open={open} onClose={() => setOpen(false)} account={account} />
    </>
  );
};

export default EuroAccountUserCard;
