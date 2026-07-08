import React, { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import styles from "./CoinActionModal.module.css";

const CoinActionModal = ({ open, mode, coin, onClose, onSend }) => {
  const [copied, setCopied] = useState(false);

  if (!open || !coin) return null;

  const handleCopy = async () => {
    if (!coin.address) return;
    try {
      await navigator.clipboard.writeText(coin.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Copy failed", error);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.stepLabel}>Step {mode === "send" ? "1 of 1" : "1 of 1"}</p>
            <h2>{mode === "send" ? "Send" : "Receive"} {coin.name}</h2>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {mode === "receive" ? (
          <div className={styles.receiveBody}>
            <div className={styles.qrWrap}>
              {coin.address ? (
                <QRCodeSVG value={coin.address} size={200} bgColor="#ffffff" fgColor="#0f172a" level="M" />
              ) : (
                <div className={styles.qrFallback}>No address available</div>
              )}
            </div>
            <p className={styles.helperText}>
              Scan this QR code or copy your {coin.symbol} wallet address below.
            </p>
            <div className={styles.addressBox}>
              <code>{coin.address || "Address not available"}</code>
              <button type="button" className={styles.copyBtn} onClick={handleCopy}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.sendBody}>
            <div className={styles.sendIcon}>↑</div>
            <h3>Withdraw {coin.symbol}</h3>
            <p className={styles.helperText}>
              You will continue in the secure withdrawal flow. Available balance:{" "}
              <strong>{coin.balance.toFixed(8)} {coin.symbol}</strong>
            </p>
            <button type="button" className={styles.primaryBtn} onClick={onSend}>
              Continue to Withdraw
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CoinActionModal;
