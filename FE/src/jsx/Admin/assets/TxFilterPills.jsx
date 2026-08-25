import React from "react";
import { ADMIN_TRANSACTION_FILTERS } from "./transactionFilterUtils";
import "./AdminTransactions.css";

const TxFilterPills = ({
  filter,
  onChange,
  count,
  subtitle = "Deposits, withdrawals, and swaps",
  title,
}) => (
  <div>
    <div className="admin-tx-topbar">
      <div>
        {title ? <p className="admin-tx-panel-title">{title}</p> : null}
        {subtitle ? <p className="admin-tx-kicker">{subtitle}</p> : null}
      </div>
      {typeof count === "number" ? (
        <span className="admin-tx-count">
          {count} record{count === 1 ? "" : "s"}
        </span>
      ) : null}
    </div>
    <div className="admin-tx-filters">
      {ADMIN_TRANSACTION_FILTERS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`admin-tx-filter-btn${filter === item.id ? " is-active" : ""}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  </div>
);

export default TxFilterPills;
