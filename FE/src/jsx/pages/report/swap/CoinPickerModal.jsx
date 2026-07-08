import React from "react";
import styles from "./CoinPickerModal.module.css";

const CoinPickerModal = ({ open, title, coins, selectedTrxName, onSelect, onClose }) => {
  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <h2>{title}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.list}>
          {coins.map((coin) => (
            <button
              key={coin.trxName}
              type="button"
              className={`${styles.item} ${selectedTrxName === coin.trxName ? styles.itemActive : ""}`}
              onClick={() => onSelect(coin)}
            >
              <span className={styles.icon}>
                {coin.logo ? (
                  <img src={coin.logo} alt={coin.name} />
                ) : (
                  <span>{coin.symbol?.slice(0, 1)}</span>
                )}
              </span>
              <span className={styles.meta}>
                <strong>{coin.name}</strong>
                <small>{coin.symbol}</small>
              </span>
              <span className={styles.balance}>{Number(coin.balance || 0).toFixed(4)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CoinPickerModal;
