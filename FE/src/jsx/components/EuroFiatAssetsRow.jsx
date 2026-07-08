import React, { useState } from "react";
import { Button } from "react-bootstrap";
import Truncate from "react-truncate-inside/es";
import EurIco from "../../assets/images/new/euro.svg";
import EuroBankDetailsModal from "./EuroBankDetailsModal";
import { hasEuroBankAccountData } from "./euroAccountUtils";
import styles from "./EuroFiatAssetsRow.module.css";

const CopyIcon = ({ success, light = false }) =>
  success ? (
    <svg
      style={light ? { color: "white" } : undefined}
      xmlns="http://www.w3.org/2000/svg"
      className="icon w-5 h-5 inline-block -mt-1 ml-1"
      width="1em"
      height="1em"
      viewBox="0 0 30 30"
    >
      <path
        fill={light ? "white" : "currentColor"}
        d="M 26.980469 5.9902344 A 1.0001 1.0001 0 0 0 26.292969 6.2929688 L 11 21.585938 L 4.7070312 15.292969 A 1.0001 1.0001 0 1 0 3.2929688 16.707031 L 10.292969 23.707031 A 1.0001 1.0001 0 0 0 11.707031 23.707031 L 27.707031 7.7070312 A 1.0001 1.0001 0 0 0 26.980469 5.9902344 z"
      />
    </svg>
  ) : (
    <svg
      style={light ? { color: "white" } : undefined}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="img"
      className="icon w-5 h-5 inline-block -mt-1 ml-1"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}>
        <rect width={13} height={13} x={9} y={9} rx={2} ry={2} />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </g>
    </svg>
  );

const EuroFiatAssetsRow = ({
  account,
  balance = 0,
  currencyLabel = "EUR",
  variant = "assets",
  onWithdraw,
  hasBankAccount,
}) => {
  const [authOpen, setAuthOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const showBankDetails = hasBankAccount ?? hasEuroBankAccountData(account);
  const iban = String(account?.iban || "").trim();
  const accountNumber = String(account?.accountNumber || "").trim();
  const displayAddress = iban || accountNumber;
  const formattedBalance = `${Number(balance || 0).toFixed(2)} ${currencyLabel}`;

  const handleCopyClick = () => {
    if (!displayAddress) return;

    navigator.clipboard
      .writeText(displayAddress)
      .then(() => {
        setCopySuccess(true);
        window.setTimeout(() => setCopySuccess(false), 2000);
      })
      .catch((err) => console.error("Failed to copy: ", err));
  };

  const bootstrapActionButtons = (
    <>
      <Button
        className="me-2"
        variant="primary btn-rounded"
        type="button"
        size={variant === "home" ? "sm" : undefined}
        onClick={onWithdraw}
      >
        Withdraw
      </Button>
      {showBankDetails && (
        <Button
          variant="outline-primary btn-rounded"
          type="button"
          size={variant === "home" ? "sm" : undefined}
          onClick={() => setAuthOpen(true)}
        >
          Authorization
        </Button>
      )}
    </>
  );

  const modernActionButtons = (
    <div className={styles.actions}>
      <button type="button" className={styles.primaryBtn} onClick={onWithdraw}>
        Withdraw
      </button>
      {showBankDetails && (
        <button type="button" className={styles.secondaryBtn} onClick={() => setAuthOpen(true)}>
          Authorization
        </button>
      )}
    </div>
  );

  const addressContent = showBankDetails ? (
    <div
      className={styles.addressCell}
      style={{ cursor: displayAddress ? "pointer" : "default" }}
      onClick={handleCopyClick}
      role={displayAddress ? "button" : undefined}
      tabIndex={displayAddress ? 0 : undefined}
      onKeyDown={(event) => {
        if (displayAddress && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          handleCopyClick();
        }
      }}
    >
      <span className={styles.addressText}>
        <Truncate offset={6} text={displayAddress || "—"} width="180" />
      </span>
      {displayAddress && (
        <span className={styles.copyIcon}>
          <CopyIcon success={copySuccess} light />
        </span>
      )}
    </div>
  ) : (
    <span className={styles.addressEmpty}>—</span>
  );

  return (
    <>
      {variant === "modern" ? (
        <section className={styles.card}>
          <div className={styles.listHeader}>
            <span>Currency</span>
            <span>Balance</span>
            <span>Withdraw</span>
            <span>Address</span>
          </div>
          <div className={styles.row}>
            <div className={styles.currency}>
              <span className={styles.coinIcon}>
                <img src={EurIco} alt="Euro" />
              </span>
              <div className={styles.coinMeta}>
                <strong>Euro</strong>
                <span>{currencyLabel}</span>
              </div>
            </div>
            <div className={styles.balance}>{formattedBalance}</div>
            {modernActionButtons}
            {addressContent}
          </div>
        </section>
      ) : variant === "home" ? (
        <tr>
          <td className="text-start no-bg widn">
            <img style={{ borderRadius: "100%" }} src={EurIco} alt="Euro" />
          </td>
          <td className="no-bg text-white">
            <p style={{ margin: 0 }} className="txt sml">
              {formattedBalance}
            </p>
            <div className="d-flex flex-wrap gap-2 mt-2 justify-content-center">{bootstrapActionButtons}</div>
          </td>
          <td
            className="text-end no-bg"
            style={{ cursor: displayAddress ? "pointer" : "default" }}
            onClick={handleCopyClick}
          >
            {displayAddress && <CopyIcon success={copySuccess} light />}
          </td>
        </tr>
      ) : (
        <tr>
          <td className="tleft">
            <span className="font-w600 fs-14">
              <img className="img30" src={EurIco} alt="" />
              Euro
            </span>
          </td>
          <td className="fs-14 font-w400">{formattedBalance}</td>
          <td>{bootstrapActionButtons}</td>
          <td>
            {showBankDetails ? (
              <p className="jas d-flex" disabled="false">
                <span className="chote">
                  <Truncate offset={6} text={displayAddress || "—"} width="180" />
                </span>
                {displayAddress && (
                  <div className="price-sec cursor-pointer" onClick={handleCopyClick}>
                    <CopyIcon success={copySuccess} />
                  </div>
                )}
              </p>
            ) : (
              <span className="text-muted">—</span>
            )}
          </td>
        </tr>
      )}

      {showBankDetails && (
        <EuroBankDetailsModal open={authOpen} onClose={() => setAuthOpen(false)} account={account} />
      )}
    </>
  );
};

export default EuroFiatAssetsRow;
