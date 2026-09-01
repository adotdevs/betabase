import React, { useMemo, useState } from "react";
import HubChart from "./HubChart";
import mm from "./MemberHub.module.css";
import {
  buildActivityItems,
  buildAllocation,
  collectAssetRows,
  comparePeriods,
  formatDate,
  formatDateTime,
  formatMoney,
  initials,
  summarizeTransactions,
} from "./hubData";
import useHubMarkToMarket from "./useHubMarkToMarket";

const OverviewTab = ({
  user,
  coinDoc,
  prices,
  loan,
  tokens,
  loading,
  canEdit,
  onEdit,
  onOpenTab,
}) => {
  const [period, setPeriod] = useState("30d");
  const currency = user?.currency === "EUR" ? "EUR" : "USD";

  const rows = useMemo(() => collectAssetRows(coinDoc, prices), [coinDoc, prices]);
  const txs = coinDoc?.transactions || [];
  const totals = useMemo(() => summarizeTransactions(txs, prices), [txs, prices]);
  const compared = useMemo(() => comparePeriods(txs, prices, period), [txs, prices, period]);
  const markToMarket = useHubMarkToMarket({
    transactions: txs,
    period,
    currency,
    livePrices: prices,
  });
  const allocation = useMemo(() => buildAllocation(rows), [rows]);
  const activity = useMemo(
    () => buildActivityItems({ transactions: txs, loan }),
    [txs, loan]
  );
  const totalBalance = rows.reduce((sum, row) => sum + (row.value || 0), 0);
  const activeAssets = rows.filter((row) => Number(row.balance) > 0).length;
  const kycOn = user?.kyc === true;
  const openLoans = loan && loan.status && !["approved", "rejected", "draft"].includes(loan.status) ? 1 : 0;

  if (loading) {
    return (
      <div className={mm.stack}>
        <div className={`${mm.card} ${mm.memberCard}`}>
          <div className={mm.identity}>
            <span className={mm.skel} style={{ width: 64, height: 64, borderRadius: 999 }} />
            <div style={{ flex: 1 }}>
              <span className={mm.skel} style={{ width: "46%", height: 22 }} />
              <span className={mm.skel} style={{ width: "70%", height: 14, marginTop: 10, display: "block" }} />
            </div>
          </div>
        </div>
        <div className={mm.stats}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className={mm.stat}>
              <span className={mm.skel} style={{ width: "40%", height: 10 }} />
              <span className={mm.skel} style={{ width: "70%", height: 22, marginTop: 10, display: "block" }} />
            </div>
          ))}
        </div>
        <div className={`${mm.card} ${mm.cardPad}`}>
          <span className={mm.skel} style={{ width: "100%", height: 220 }} />
        </div>
      </div>
    );
  }

  const trend = (value) => {
    if (value == null) return <span className={mm.statHint}>No prior period</span>;
    const up = value >= 0;
    return (
      <p className={`${mm.statHint} ${up ? mm.up : mm.down}`}>
        {up ? "+" : ""}
        {value.toFixed(1)}% vs previous
      </p>
    );
  };

  return (
    <div className={mm.stack}>
      <section className={`${mm.card} ${mm.memberCard}`}>
        <div className={mm.identity}>
          <div className={mm.avatar} aria-hidden="true">{initials(user)}</div>
          <div>
            <div className={mm.nameRow}>
              <h1 className={mm.name}>
                {`${user?.firstName || ""} ${user?.lastName || ""}`.trim() || user?.email || "Member"}
              </h1>
              <span className={`${mm.badge} ${kycOn ? mm.badgeOk : mm.badgeWarn}`}>
                {kycOn ? "KYC approved" : "KYC pending"}
              </span>
              {user?.verified ? <span className={`${mm.badge} ${mm.badgeInfo}`}>Email verified</span> : null}
              {user?.online ? <span className={`${mm.badge} ${mm.badgeInfo}`}>Online</span> : null}
            </div>
            <div className={mm.contact}>
              <span>{user?.email || "—"}</span>
              <span>{user?.phone || "—"}</span>
              <span>
                {[user?.address, user?.city, user?.country, user?.postalCode].filter(Boolean).join(", ") || "—"}
              </span>
            </div>
            <div className={mm.actions}>
              {canEdit ? (
                <button type="button" className={mm.btn} onClick={onEdit}>
                  Edit member
                </button>
              ) : null}
              <button type="button" className={mm.btnGhost} onClick={() => onOpenTab("transactions")}>
                Transactions
              </button>
              <button type="button" className={mm.btnGhost} onClick={() => onOpenTab("assets")}>
                Wallet
              </button>
            </div>
          </div>
        </div>
        <div className={mm.metaGrid}>
          <div>
            <span className={mm.metaLabel}>Member ID</span>
            <span className={mm.metaValue}>{user?._id || "—"}</span>
          </div>
          <div>
            <span className={mm.metaLabel}>Member since</span>
            <span className={mm.metaValue}>{formatDate(user?.createdAt)}</span>
          </div>
          <div>
            <span className={mm.metaLabel}>Role</span>
            <span className={mm.metaValue}>{user?.role || "user"}</span>
          </div>
          <div>
            <span className={mm.metaLabel}>Last activity</span>
            <span className={mm.metaValue}>{formatDateTime(user?.lastActivity || user?.lastOnline)}</span>
          </div>
        </div>
      </section>

      <section className={mm.stats}>
        <article className={mm.stat}>
          <p className={mm.statLabel}>Total balance</p>
          <p className={mm.statValue}>{formatMoney(totalBalance, currency)}</p>
          <p className={mm.statHint}>{activeAssets} funded assets</p>
        </article>
        <article className={mm.stat}>
          <p className={mm.statLabel}>Total deposited</p>
          <p className={mm.statValue}>{formatMoney(totals.deposits, currency)}</p>
          {trend(compared.depositTrend)}
        </article>
        <article className={mm.stat}>
          <p className={mm.statLabel}>Total withdrawn</p>
          <p className={mm.statValue}>{formatMoney(totals.withdrawals, currency)}</p>
          {trend(compared.withdrawTrend)}
        </article>
        <article className={mm.stat}>
          <p className={mm.statLabel}>Open applications</p>
          <p className={mm.statValue}>{openLoans}</p>
          <p className={mm.statHint}>{loan?.status ? `Loan: ${loan.status}` : "No open loan"}</p>
        </article>
        <article className={mm.stat}>
          <p className={mm.statLabel}>KYC status</p>
          <p className={mm.statValue}>{kycOn ? "Approved" : "Pending"}</p>
          <p className={mm.statHint}>{user?.submitDoc?.status || "No submission state"}</p>
        </article>
        <article className={mm.stat}>
          <p className={mm.statLabel}>Active assets</p>
          <p className={mm.statValue}>{activeAssets}</p>
          <p className={mm.statHint}>{tokens?.length || 0} custom tokens</p>
        </article>
      </section>

      <div className={mm.grid2}>
        <section className={`${mm.card} ${mm.cardPad}`}>
          <div className={mm.cardHead}>
            <div>
              <h2 className={mm.title}>Portfolio value</h2>
              <p className={mm.subtitle}>
                Daily holdings × that day&apos;s market price
                {markToMarket.changePct != null ? (
                  <span className={markToMarket.changePct >= 0 ? mm.up : mm.down}>
                    {" "}
                    {markToMarket.changePct >= 0 ? "+" : ""}
                    {markToMarket.changePct.toFixed(1)}%
                  </span>
                ) : null}
              </p>
            </div>
            <div className={mm.periods}>
              {["7d", "30d", "90d", "1y"].map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`${mm.period} ${period === key ? mm.periodOn : ""}`}
                  onClick={() => setPeriod(key)}
                >
                  {key === "1y" ? "1 Year" : key.replace("d", " Days")}
                </button>
              ))}
            </div>
          </div>
          {markToMarket.loading ? (
            <span className={mm.skel} style={{ width: "100%", height: 220, display: "block" }} />
          ) : (
            <HubChart
              type="value"
              currency={currency}
              data={markToMarket.hasData ? markToMarket.points : []}
              emptyLabel="No holdings to mark to market"
            />
          )}
        </section>
        <section className={`${mm.card} ${mm.cardPad}`}>
          <div className={mm.cardHead}>
            <div>
              <h2 className={mm.title}>Asset allocation</h2>
              <p className={mm.subtitle}>Current balances only</p>
            </div>
          </div>
          <HubChart type="pie" data={allocation} emptyLabel="No funded assets to chart" />
        </section>
      </div>

      <div className={mm.grid2}>
        <section className={`${mm.card} ${mm.cardPad}`}>
          <div className={mm.cardHead}>
            <div>
              <h2 className={mm.title}>Identity & contact</h2>
              <p className={mm.subtitle}>Read-only profile from the member record</p>
            </div>
            {canEdit ? (
              <button type="button" className={mm.btnGhost} onClick={onEdit}>
                Edit
              </button>
            ) : null}
          </div>
          <dl className={mm.dl}>
            <div>
              <dt>Username / email</dt>
              <dd>{user?.email || "—"}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{user?.phone || "—"}</dd>
            </div>
            <div>
              <dt>First name</dt>
              <dd>{user?.firstName || "—"}</dd>
            </div>
            <div>
              <dt>Last name</dt>
              <dd>{user?.lastName || "—"}</dd>
            </div>
            <div>
              <dt>City</dt>
              <dd>{user?.city || "—"}</dd>
            </div>
            <div>
              <dt>Country</dt>
              <dd>{user?.country || "—"}</dd>
            </div>
            <div>
              <dt>Postal code</dt>
              <dd>{user?.postalCode || "—"}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>{user?.currency || "—"}</dd>
            </div>
            <div>
              <dt>AI trading %</dt>
              <dd>{user?.AiTradingPercentage ?? "—"}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{user?.address || "—"}</dd>
            </div>
          </dl>
        </section>
        <section className={`${mm.card} ${mm.cardPad}`}>
          <div className={mm.cardHead}>
            <div>
              <h2 className={mm.title}>Recent activity</h2>
              <p className={mm.subtitle}>Built from transactions, loan, and KYC records</p>
            </div>
          </div>
          {activity.length ? (
            <ul className={mm.feed}>
              {activity.map((item) => (
                <li key={item.id} className={mm.feedItem}>
                  <strong>{item.title}</strong>
                  <span className={mm.subtitle}>{item.detail}</span>
                  <span className={mm.subtitle}>{formatDateTime(item.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className={mm.empty}>No recorded activity yet</div>
          )}
        </section>
      </div>
    </div>
  );
};

export default OverviewTab;
