import React from "react";
import { ADMIN_TRANSACTION_FILTERS } from "./transactionFilterUtils";
import styles from "./AdminTransactions.module.css";

const TxFilterPills = ({
  filter,
  onChange,
  count,
  subtitle = "Deposits, withdrawals, and swaps",
  title,
}) => (
  <div>
    <div className={styles.topbar}>
      <div>
        {title ? <p className={styles.title}>{title}</p> : null}
        {subtitle ? <p className={styles.kicker}>{subtitle}</p> : null}
      </div>
      {typeof count === "number" ? (
        <span className={styles.count}>
          {count} record{count === 1 ? "" : "s"}
        </span>
      ) : null}
    </div>
    <div className={styles.filters}>
      {ADMIN_TRANSACTION_FILTERS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`${styles.filterBtn}${filter === item.id ? ` ${styles.filterActive}` : ""}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  </div>
);

export default TxFilterPills;
