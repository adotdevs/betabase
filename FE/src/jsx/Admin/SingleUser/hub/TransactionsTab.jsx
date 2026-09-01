import React, { useMemo, useState } from "react";
import UserTransactions from "../UserTransactions";
import HubChart from "./HubChart";
import mm from "./MemberHub.module.css";
import { buildFlowSeries, buildTypeBreakdown, formatMoney, summarizeTransactions } from "./hubData";

const TransactionsTab = ({ transactions = [], prices = {}, currency = "USD" }) => {
  const [period, setPeriod] = useState("30d");
  const summary = useMemo(() => summarizeTransactions(transactions, prices), [transactions, prices]);
  const flow = useMemo(() => buildFlowSeries(transactions, prices, period), [transactions, prices, period]);
  const breakdown = useMemo(() => buildTypeBreakdown(transactions, prices), [transactions, prices]);

  return (
    <div className={mm.stack}>
      <section className={mm.stats}>
        <article className={mm.stat}>
          <p className={mm.statLabel}>Total deposits</p>
          <p className={mm.statValue}>{formatMoney(summary.deposits, currency)}</p>
        </article>
        <article className={mm.stat}>
          <p className={mm.statLabel}>Total withdrawals</p>
          <p className={mm.statValue}>{formatMoney(summary.withdrawals, currency)}</p>
        </article>
        <article className={mm.stat}>
          <p className={mm.statLabel}>Total swaps</p>
          <p className={mm.statValue}>{formatMoney(summary.swaps, currency)}</p>
        </article>
        <article className={mm.stat}>
          <p className={mm.statLabel}>Net flow</p>
          <p className={mm.statValue}>{formatMoney(summary.net, currency)}</p>
        </article>
      </section>
      <div className={mm.grid2}>
        <section className={`${mm.card} ${mm.cardPad}`}>
          <div className={mm.cardHead}>
            <div>
              <h2 className={mm.title}>Deposits vs withdrawals</h2>
              <p className={mm.subtitle}>From this member&apos;s recorded transactions</p>
            </div>
            <div className={mm.periods}>
              {["7d", "30d", "90d", "1y"].map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`${mm.period} ${period === key ? mm.periodOn : ""}`}
                  onClick={() => setPeriod(key)}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
          <HubChart type="bar" data={flow.hasData ? flow.points : []} />
        </section>
        <section className={`${mm.card} ${mm.cardPad}`}>
          <div className={mm.cardHead}>
            <div>
              <h2 className={mm.title}>Volume by type</h2>
              <p className={mm.subtitle}>Completed fiat value by category</p>
            </div>
          </div>
          <HubChart type="pie" data={breakdown} emptyLabel="No transaction volume to chart" />
        </section>
      </div>
      <div className={mm.embed}>
        <UserTransactions embedded />
      </div>
    </div>
  );
};

export default TransactionsTab;
