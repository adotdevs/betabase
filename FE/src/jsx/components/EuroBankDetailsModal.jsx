import React, { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import { getVisibleEuroFields } from "./euroAccountUtils";
import styles from "./EuroAccountUserCard.module.css";

const EuroBankDetailsModal = ({ open, onClose, account, title = "Euro Bank Account" }) => {
  const [copiedKey, setCopiedKey] = useState("");

  if (!open || !account || typeof document === "undefined") return null;

  const visibleFields = getVisibleEuroFields(account);

  const copyFieldValue = async (key, label, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      toast.success(`${label} copied`);
      window.setTimeout(() => setCopiedKey(""), 2000);
    } catch (error) {
      toast.error("Could not copy to clipboard");
    }
  };

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={styles.modalPanel}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="euro-account-modal-title"
      >
        <div className={styles.modalHeader}>
          <div className={styles.modalHeaderText}>
            <h2 id="euro-account-modal-title" className={styles.modalTitle}>
              {title}
            </h2>
            <p className={styles.modalSubtitle}>
              Use these details for bank transfers linked to your account.
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.detailsList}>
            {visibleFields.map(({ key, label, value }) => (
              <div key={key} className={styles.detailRow}>
                <div className={styles.detailRowHeader}>
                  <span className={styles.detailLabel}>{label}</span>
                  <button
                    type="button"
                    className={styles.copyBtn}
                    onClick={() => copyFieldValue(key, label, value)}
                    aria-label={`Copy ${label}`}
                  >
                    {copiedKey === key ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className={styles.detailValue}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default EuroBankDetailsModal;
