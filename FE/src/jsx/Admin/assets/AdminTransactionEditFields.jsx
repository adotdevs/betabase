import React from "react";
import {
  ADMIN_TRX_NAME_OPTIONS,
  parseSwapNote,
  patchSwapNoteField,
} from "./adminTransactionEdit";

const fieldClass =
  "border border-gray-700 py-1 px-3 w-full rounded text-sm text-gray-100 bg-gray-900";
const labelClass = "text-sm font-medium text-gray-400";

const datetimeValue = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const AdminTransactionEditFields = ({ transaction, onChange }) => {
  if (!transaction || typeof transaction !== "object") return null;

  const trxOptions = ADMIN_TRX_NAME_OPTIONS.includes(transaction.trxName)
    ? ADMIN_TRX_NAME_OPTIONS
    : [transaction.trxName, ...ADMIN_TRX_NAME_OPTIONS].filter(Boolean);

  const swapNote = parseSwapNote(transaction.note);
  const staking = transaction.stakingData;

  const setField = (name, value) => onChange({ ...transaction, [name]: value });
  const setStaking = (name, value) =>
    onChange({
      ...transaction,
      stakingData: { ...(transaction.stakingData || {}), [name]: value },
    });

  return (
    <>
      <div className="sm:col-span-1">
        <dt className={labelClass}>Asset</dt>
        <dd className="mt-1">
          <select
            className={fieldClass}
            name="trxName"
            value={transaction.trxName || ""}
            onChange={(e) => setField("trxName", e.target.value)}
          >
            {trxOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </dd>
      </div>
      <div className="sm:col-span-1">
        <dt className={labelClass}>Method</dt>
        <dd className="mt-1">
          <select
            className={fieldClass}
            name="withdraw"
            value={transaction.withdraw || "admin"}
            onChange={(e) => setField("withdraw", e.target.value)}
          >
            <option value="admin">Admin</option>
            <option value="crypto">Crypto</option>
            <option value="bank">Bank</option>
          </select>
        </dd>
      </div>
      <div className="sm:col-span-1">
        <dt className={labelClass}>Destination / payment</dt>
        <dd className="mt-1">
          <input
            type="text"
            className={fieldClass}
            name="selectedPayment"
            value={transaction.selectedPayment || ""}
            onChange={(e) => setField("selectedPayment", e.target.value)}
          />
        </dd>
      </div>
      <div className="sm:col-span-1">
        <dt className={labelClass}>Created by</dt>
        <dd className="mt-1">
          <input
            type="text"
            className={fieldClass}
            name="by"
            value={transaction.by || ""}
            onChange={(e) => setField("by", e.target.value)}
          />
        </dd>
      </div>
      <div className="sm:col-span-2">
        <label className="mt-1 inline-flex items-center gap-2 text-sm text-gray-100">
          <input
            type="checkbox"
            checked={Boolean(transaction.isHidden)}
            onChange={(e) => setField("isHidden", e.target.checked)}
          />
          Hide from user transaction list
        </label>
      </div>

      {swapNote ? (
        <>
          <div className="sm:col-span-1">
            <dt className={labelClass}>Swap from asset</dt>
            <dd className="mt-1">
              <input
                type="text"
                className={fieldClass}
                value={swapNote.from?.trxName || ""}
                onChange={(e) =>
                  onChange(patchSwapNoteField(transaction, "from.trxName", e.target.value))
                }
              />
            </dd>
          </div>
          <div className="sm:col-span-1">
            <dt className={labelClass}>Swap from amount</dt>
            <dd className="mt-1">
              <input
                type="number"
                step="any"
                className={fieldClass}
                value={swapNote.from?.amount ?? ""}
                onChange={(e) =>
                  onChange(patchSwapNoteField(transaction, "from.amount", e.target.value))
                }
              />
            </dd>
          </div>
          <div className="sm:col-span-1">
            <dt className={labelClass}>Swap to asset</dt>
            <dd className="mt-1">
              <input
                type="text"
                className={fieldClass}
                value={swapNote.to?.trxName || ""}
                onChange={(e) =>
                  onChange(patchSwapNoteField(transaction, "to.trxName", e.target.value))
                }
              />
            </dd>
          </div>
          <div className="sm:col-span-1">
            <dt className={labelClass}>Swap to amount</dt>
            <dd className="mt-1">
              <input
                type="number"
                step="any"
                className={fieldClass}
                value={swapNote.to?.amount ?? ""}
                onChange={(e) =>
                  onChange(patchSwapNoteField(transaction, "to.amount", e.target.value))
                }
              />
            </dd>
          </div>
        </>
      ) : null}

      {transaction.isTrading ? (
        <>
          <div className="sm:col-span-1">
            <dt className={labelClass}>Trading status</dt>
            <dd className="mt-1">
              <select
                className={fieldClass}
                value={transaction.tradingStatus || ""}
                onChange={(e) => setField("tradingStatus", e.target.value)}
              >
                <option value="">—</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="simple">Simple</option>
              </select>
            </dd>
          </div>
          <div className="sm:col-span-1">
            <dt className={labelClass}>Trading time</dt>
            <dd className="mt-1">
              <input
                type="text"
                className={fieldClass}
                value={transaction.tradingTime || ""}
                onChange={(e) => setField("tradingTime", e.target.value)}
              />
            </dd>
          </div>
          <div className="sm:col-span-1">
            <dt className={labelClass}>Total profit</dt>
            <dd className="mt-1">
              <input
                type="number"
                step="any"
                className={fieldClass}
                value={transaction.totalProfit ?? ""}
                onChange={(e) => setField("totalProfit", e.target.value)}
              />
            </dd>
          </div>
          <div className="sm:col-span-1">
            <dt className={labelClass}>Closed at</dt>
            <dd className="mt-1">
              <input
                type="datetime-local"
                className={fieldClass}
                value={datetimeValue(transaction.closedAt)}
                onChange={(e) => setField("closedAt", e.target.value)}
              />
            </dd>
          </div>
        </>
      ) : null}

      {staking?.isStaking ? (
        <>
          <div className="sm:col-span-1">
            <dt className={labelClass}>Staking duration (days)</dt>
            <dd className="mt-1">
              <input
                type="number"
                className={fieldClass}
                value={staking.duration ?? ""}
                onChange={(e) => setStaking("duration", e.target.value)}
              />
            </dd>
          </div>
          <div className="sm:col-span-1">
            <dt className={labelClass}>Staking interest %</dt>
            <dd className="mt-1">
              <input
                type="number"
                step="any"
                className={fieldClass}
                value={staking.interestRate ?? ""}
                onChange={(e) => setStaking("interestRate", e.target.value)}
              />
            </dd>
          </div>
          <div className="sm:col-span-1">
            <dt className={labelClass}>Expected reward</dt>
            <dd className="mt-1">
              <input
                type="number"
                step="any"
                className={fieldClass}
                value={staking.expectedReward ?? ""}
                onChange={(e) => setStaking("expectedReward", e.target.value)}
              />
            </dd>
          </div>
          <div className="sm:col-span-1">
            <dt className={labelClass}>Actual reward</dt>
            <dd className="mt-1">
              <input
                type="number"
                step="any"
                className={fieldClass}
                value={staking.actualReward ?? ""}
                onChange={(e) => setStaking("actualReward", e.target.value)}
              />
            </dd>
          </div>
          <div className="sm:col-span-1">
            <dt className={labelClass}>Staking status</dt>
            <dd className="mt-1">
              <select
                className={fieldClass}
                value={staking.status || ""}
                onChange={(e) => setStaking("status", e.target.value)}
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </dd>
          </div>
        </>
      ) : null}
    </>
  );
};

export default AdminTransactionEditFields;
