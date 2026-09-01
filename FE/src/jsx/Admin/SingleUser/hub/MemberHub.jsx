import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuthUser } from "react-auth-kit";
import { toast } from "react-toastify";
import { signleUsersApi } from "../../../../Api/Service";
import { extractLivePrices } from "../../../../utils/euroCoinUtils";
import { buildAdminPriceMap } from "../../assets/adminTxDisplay";
import MemberPageChrome from "./MemberPageChrome";
import OverviewTab from "./OverviewTab";
import HubChart from "./HubChart";
import mm from "./MemberHub.module.css";
import { HUB_TABS, buildAllocation, collectAssetRows, isStaffProfile } from "./hubData";
import useHubMarkToMarket from "./useHubMarkToMarket";
import { loadHubOverviewOnce, loadLoanOnce } from "./hubCache";

const UserAssets = React.lazy(() => import("../UserAssets"));
const UserBankAccounts = React.lazy(() => import("../UserBankAccounts"));
const UserCryptoCard = React.lazy(() => import("../UserCryptoCard"));
const UserDocs = React.lazy(() => import("../UserDocs"));
const UserVerifications = React.lazy(() => import("../UserVerificatons"));
const UserLoanApplication = React.lazy(() => import("../UserLoanApplication"));
const General = React.lazy(() => import("../General"));
const TransactionsTab = React.lazy(() => import("./TransactionsTab"));
const PortfolioTab = React.lazy(() => import("./PortfolioTab"));

const validTab = (value) => (HUB_TABS.some((tab) => tab.id === value) ? value : "overview");

const TabFallback = () => (
  <div className={`${mm.card} ${mm.cardPad}`}>
    <span className={mm.skel} style={{ height: 280, display: "block" }} />
  </div>
);

const AssetsAllocation = ({ coinDoc, prices, currency = "USD" }) => {
  const [period, setPeriod] = React.useState("30d");
  const rows = collectAssetRows(coinDoc, prices);
  const allocation = buildAllocation(rows);
  const markToMarket = useHubMarkToMarket({
    transactions: coinDoc?.transactions || [],
    period,
    currency,
    livePrices: prices,
  });

  return (
    <div className={mm.grid2}>
      <section className={`${mm.card} ${mm.cardPad}`}>
        <div className={mm.cardHead}>
          <div>
            <h2 className={mm.title}>Wallet value</h2>
            <p className={mm.subtitle}>
              Daily coin balances × that day&apos;s market price
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
                {key}
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
            <p className={mm.subtitle}>Current wallet balances only</p>
          </div>
        </div>
        <HubChart type="pie" data={allocation} emptyLabel="No funded assets to chart" />
      </section>
    </div>
  );
};

const MemberHub = () => {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const Navigate = useNavigate();
  const authUser = useAuthUser();
  const tab = validTab(searchParams.get("tab"));
  const editing = searchParams.get("edit") === "1";

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [coinDoc, setCoinDoc] = useState(null);
  const [prices, setPrices] = useState({});
  const [loan, setLoan] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [canEdit, setCanEdit] = useState(true);

  const setTab = (next, extra = {}) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    if (!extra.edit) params.delete("edit");
    else params.set("edit", "1");
    setSearchParams(params, { replace: true });
  };

  useEffect(() => {
    let cancelled = false;

    const loadOverview = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const current = authUser()?.user;
        if (current?._id === id) {
          Navigate("/admin/dashboard");
          return;
        }
        if (current?.role === "user") {
          Navigate("/dashboard");
          return;
        }

        const overview = await loadHubOverviewOnce(id);
        if (cancelled || !overview) return;

        const { userRes, coinRes, tokenRes } = overview;

        if (userRes?.success) {
          const target = userRes.signleUser;
          setUser(target);

          if (current?.role === "admin") {
            const self = await signleUsersApi(current._id);
            if (cancelled) return;
            if (
              target?.role !== "user" &&
              self?.signleUser?.adminPermissions?.isSubManagement === false
            ) {
              Navigate("/admin/dashboard");
              return;
            }
            setCanEdit(true);
          } else if (current?.role === "subadmin") {
            const self = await signleUsersApi(current._id);
            if (cancelled) return;
            const canView = self?.signleUser?.permissions?.viewClientDetails === true;
            const canChange = self?.signleUser?.permissions?.editUserProfile === true;
            setCanEdit(canChange);
            if (!canView) {
              toast.error("You do not have permission to view client personal details");
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set("tab", "assets");
                next.delete("edit");
                return next;
              }, { replace: true });
            }
          } else {
            setCanEdit(true);
          }

          if (isStaffProfile(target)) {
            setLoading(false);
            return;
          }
        } else {
          toast.error(userRes?.msg || "Failed to load member");
        }

        const loanDoc = await loadLoanOnce(id);
        if (cancelled) return;

        if (coinRes?.success) {
          setCoinDoc(coinRes.getCoin || null);
          const live = extractLivePrices(coinRes, userRes?.signleUser?.currency);
          setPrices(
            buildAdminPriceMap({
              liveBtc: live.btc,
              liveEth: live.eth,
              liveBnb: live.bnb,
              liveXrp: live.xrp,
              liveDoge: live.doge,
              liveSol: live.sol,
              liveTon: live.ton,
              liveLink: live.link,
              liveDot: live.dot,
              liveNear: live.near,
              liveUsdc: live.usdc,
              liveTrx: live.trx,
            })
          );
        }

        setLoan(loanDoc);
        setTokens(
          tokenRes?.success
            ? tokenRes.stocks || tokenRes.tokens || tokenRes.allTokens || []
            : []
        );
      } catch (error) {
        if (!cancelled) {
          toast.error(error?.msg || "Failed to load member hub");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadOverview();
    return () => {
      cancelled = true;
    };
    // Only reload when the member id changes. authUser/navigate identities are unstable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const currency = user?.currency === "EUR" ? "EUR" : "USD";
  const memberName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || user?.email || "Member";
  const staffProfile = isStaffProfile(user);
  const pageName = staffProfile
    ? user?.role === "subadmin"
      ? "Subadmin Profile"
      : "Admin Profile"
    : "Member Management Hub";

  return (
    <MemberPageChrome pageName={pageName}>
      <div className={`${mm.root} member-management-v2`}>
        <div className={mm.stack}>
          <header className={mm.pageHead}>
            <p className={mm.kicker}>{staffProfile ? pageName : "Member Management Hub"}</p>
            <h1 className={mm.pageTitle}>{loading ? "Loading member" : memberName}</h1>
          </header>

          {loading ? (
            <TabFallback />
          ) : staffProfile ? (
            <React.Suspense fallback={<TabFallback />}>
              <div className={mm.embed}>
                <General embedded />
              </div>
            </React.Suspense>
          ) : (
            <nav className={mm.tabs} aria-label="Member hub">
              {HUB_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${mm.tab} ${tab === item.id ? mm.tabActive : ""}`}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          )}

          {!loading && !staffProfile && tab === "overview" && !editing && (
            <OverviewTab
              user={user}
              coinDoc={coinDoc}
              prices={prices}
              loan={loan}
              tokens={tokens}
              loading={loading}
              canEdit={canEdit}
              onEdit={() => setTab("overview", { edit: true })}
              onOpenTab={setTab}
            />
          )}

          {!loading && !staffProfile && tab === "overview" && editing && (
            <React.Suspense fallback={<TabFallback />}>
              <div className={mm.stack}>
                <div className={mm.actions}>
                  <button type="button" className={mm.btnGhost} onClick={() => setTab("overview")}>
                    Back to overview
                  </button>
                </div>
                <div className={mm.embed}>
                  <General embedded />
                </div>
              </div>
            </React.Suspense>
          )}

          {!loading && !staffProfile && tab === "assets" && (
            <React.Suspense fallback={<TabFallback />}>
              <div className={mm.stack}>
                <AssetsAllocation coinDoc={coinDoc} prices={prices} currency={currency} />
                <p className={mm.sectionLabel}>Crypto & fiat wallets</p>
                <div className={mm.embed}>
                  <UserAssets embedded />
                </div>
                <p className={mm.sectionLabel}>Bank accounts</p>
                <div className={mm.embed}>
                  <UserBankAccounts embedded />
                </div>
                <p className={mm.sectionLabel}>Crypto card</p>
                <div className={mm.embed}>
                  <UserCryptoCard embedded />
                </div>
              </div>
            </React.Suspense>
          )}

          {!loading && !staffProfile && tab === "transactions" && (
            <React.Suspense fallback={<TabFallback />}>
              <TransactionsTab
                transactions={coinDoc?.transactions || []}
                prices={prices}
                currency={currency}
              />
            </React.Suspense>
          )}

          {!loading && !staffProfile && tab === "compliance" && (
            <React.Suspense fallback={<TabFallback />}>
              <div className={mm.stack}>
                <p className={mm.sectionLabel}>KYC & verifications</p>
                <div className={mm.embed}>
                  <UserVerifications embedded />
                </div>
                <p className={mm.sectionLabel}>Documents</p>
                <div className={mm.embed}>
                  <UserDocs embedded />
                </div>
                <p className={mm.sectionLabel}>Loan application</p>
                <div className={mm.embed}>
                  <UserLoanApplication embedded />
                </div>
              </div>
            </React.Suspense>
          )}

          {!loading && !staffProfile && tab === "portfolio" && (
            <React.Suspense fallback={<TabFallback />}>
              <PortfolioTab userId={id} tokens={tokens} currency={currency} />
            </React.Suspense>
          )}
        </div>
      </div>
    </MemberPageChrome>
  );
};

export default MemberHub;
