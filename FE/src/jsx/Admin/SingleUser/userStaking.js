import React, { useState, useEffect } from "react";
import AdminSkeleton from "../theme/AdminSkeleton";
import SideBar from "../../layouts/AdminSidebar/Sidebar";
import AdminHeader from "../adminHeader";
import { useAuthUser } from "react-auth-kit";
import { useNavigate, useParams } from "react-router-dom";
import NearProtocol from '../../../assets/images/new/6.png';
import TonCoin from '../../../assets/images/new/3.png';

import { toast } from "react-toastify";
import { getStakingSettingsApi, updateStakingSettingsApi, getCoinsApi, patchCoinsApi } from "../../../Api/Service";
import './styleNew.css'
import UserSideBar from "./UserSideBar";
import su from "./SingleUserLayout.module.css";
import st from "./UserStaking.module.css";
import MemberShell from "./hub/MemberShell";

const StakingSettings = ({ embedded = false }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [stakingSettings, setStakingSettings] = useState({
        disabledCoins: [],
        customRates: {}
    });
    const [allCoins, setAllCoins] = useState([]);
    const [Active, setActive] = useState(false);

    const authUser = useAuthUser();
    const navigate = useNavigate();
    const { id } = useParams();
const patchCoins = async () => {
    try {
      const userCoins = await patchCoinsApi(id);

      if (userCoins.success) {
       
      } else {
        toast.dismiss();
        toast.error(userCoins.msg);
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error);
    } finally {
    }
  };
    // Coin data for reference
    const coinData = {
        bitcoin: { name: "Bitcoin", symbol: "btc", icon: "https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/btc.png" },
        ethereum: { name: "Ethereum", symbol: "eth", icon: "https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/eth.png" },
        tether: { name: "Tether", symbol: "usdt", icon: "https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/usdt.png" },
        bnb: { name: "BNB", symbol: "bnb", icon: "https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/bnb.png" },
        xrp: { name: "XRP", symbol: "xrp", icon: "https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/xrp.png" },
        doge: { name: "Dogecoin", symbol: "doge", icon: "https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/doge.png" },
        ton: { name: "Toncoin", symbol: "ton", icon: TonCoin },
        link: { name: "Chainlink", symbol: "link", icon: "https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/link.png" },
        dot: { name: "Polkadot", symbol: "dot", icon: "https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/dot.png" },
        near: { name: "Near Protocol", symbol: "near", icon: NearProtocol },
        usdc: { name: "USD Coin", symbol: "usdc", icon: "https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/usdc.png" },
        trx: { name: "Tron", symbol: "trx", icon: "https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/trx.png" },
        sol: { name: "Solana", symbol: "sol", icon: "https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/sol.png" },
        eur: { name: "Euro", symbol: "eur", icon: "https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/eur.png" }
    };

    const toggleBar = () => {
        setActive(!Active);
    };

    const fetchStakingSettings = async () => {
        try {
            const settings = await getStakingSettingsApi(id);
            if (settings.success) {
                setStakingSettings(settings.stakingSettings);
            } else {
                toast.error(settings.msg);
            }
        } catch (error) {
            toast.error("Error fetching staking settings");
            console.error("Error fetching staking settings:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchCoins = async () => {
        try {
            const coins = await getCoinsApi(id);
            if (coins.success) {
                setAllCoins(coins.getCoin);
            }
        } catch (error) {
            console.error("Error fetching coins:", error);
        }
    };

    useEffect(() => {
        if (authUser().user.role === "user") {
            navigate("/dashboard");
            return;

        }
        fetchStakingSettings();
        fetchCoins();
        patchCoins()
    }, [id]);

    const toggleCoinStatus = (coinKey) => {
        setStakingSettings(prev => {
            const disabledCoins = prev.disabledCoins.includes(coinKey)
                ? prev.disabledCoins.filter(c => c !== coinKey)
                : [...prev.disabledCoins, coinKey];
            
            return {
                ...prev,
                disabledCoins
            };
        });
    };

    const updateCoinRates = (coinKey, duration, value) => {
        const numericValue = parseFloat(value);
        if (isNaN(numericValue) || numericValue < 0) return;

        setStakingSettings(prev => ({
            ...prev,
            customRates: {
                ...prev.customRates,
                [coinKey]: {
                    ...prev.customRates[coinKey],
                    [duration]: numericValue
                }
            }
        }));
    };

    const saveSettings = async () => {
        try {
            setIsSaving(true);
            const response = await updateStakingSettingsApi(id, stakingSettings);
           
            
            if (response.success) {
                toast.success("Staking settings updated successfully");
            } else {
                toast.error(response.msg);
            }
        } catch (error) {
            toast.error("Error updating staking settings");
            console.error("Error updating staking settings:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const getRateForCoin = (coinKey, duration) => {
        const coinRates = stakingSettings.customRates[coinKey];
        if (coinRates && coinRates[duration] !== undefined) {
            return coinRates[duration];
        }
        
        // Default rates
        const defaultRates = {
            thirtyDays: 11,
            sixtyDays: 45,
            ninetyDays: 123
        };
        
        return defaultRates[duration];
    };

    const resetCoinRates = (coinKey) => {
        setStakingSettings(prev => ({
            ...prev,
            customRates: {
                ...prev.customRates,
                [coinKey]: undefined
            }
        }));
    };

    if (isLoading) {
        return (
            <MemberShell embedded={embedded}><div className={embedded ? undefined : "admin"}>
                <div className={embedded ? undefined : "bg-muted-100 dark:bg-muted-900 pb-20"}>
                    {!embedded && <SideBar state={Active} toggle={toggleBar} />}
                    <div className={embedded ? undefined : "bg-muted-100 dark:bg-muted-900 relative min-h-screen w-full overflow-x-hidden px-4 transition-all duration-300 xl:px-10 lg:max-w-[calc(100%_-_280px)] lg:ms-[280px]"}>
                        {!embedded && <AdminHeader toggle={toggleBar} pageName="Staking Settings" />}
                        <div className={embedded ? undefined : su.frame}>
                          {!embedded && <UserSideBar userid={id} />}
                          <div className={embedded ? undefined : su.main}>
                            <AdminSkeleton variant="cards" rows={6} />
                          </div>
                        </div>
                    </div>
                </div>
            </div>
            </MemberShell>
        );
    }

    return (
    <MemberShell embedded={embedded}>
    <div className={embedded ? undefined : "admin"}>
      <div className={embedded ? undefined : "bg-muted-100 dark:bg-muted-900 pb-20"}>
    {!embedded && <SideBar state={Active} toggle={toggleBar} />}
        <div className={embedded ? undefined : "bg-muted-100 dark:bg-muted-900 relative min-h-screen w-full overflow-x-hidden px-4 transition-all duration-300 xl:px-10 lg:max-w-[calc(100%_-_280px)] lg:ms-[280px]"}>
          <div className={embedded ? undefined : "mx-auto w-full max-w-7xl"}>
      {!embedded && <AdminHeader toggle={toggleBar} pageName="Staking Settings" />}

            <div className={embedded ? undefined : su.frame}>
          {!embedded && <UserSideBar userid={id} />}

              <div className={embedded ? undefined : su.main}>
             <div className={st.actions}>
            <h4 className={st.actionsTitle}>Quick Actions</h4>
              <button
                onClick={() => setStakingSettings((prev) => ({ ...prev, disabledCoins: [] }))}
                className={`${st.btn} ${st.btnSuccess}`}
              >
                Enable All Coins
              </button>
              <button
                onClick={() =>
                  setStakingSettings((prev) => ({
                    ...prev,
                    disabledCoins: Object.keys(coinData),
                  }))
                }
                className={`${st.btn} ${st.btnDanger}`}
              >
                Disable All Coins
              </button>
              <button
                onClick={() =>
                  setStakingSettings((prev) => ({ ...prev, customRates: {} }))}
                className={`${st.btn} ${st.btnInfo}`}
              >
                Reset All Rates
              </button>
          </div>
          <div className={st.head}>
             <div>
              <p className={st.title}>Staking Configuration</p>
              <p className={st.subtitle}>
                Manage staking settings for user: <span>{id}</span>
              </p>
            </div>
             <button
              onClick={saveSettings}
              disabled={isSaving}
              className={`${st.btn} ${st.btnPrimary}`}
            >
              {isSaving ? "Saving..." : "Save Settings"}
            </button>
          </div>

          <div className={st.grid}>
            {Object.entries(coinData).map(([coinKey, coin]) => (
              <div key={coinKey} className={st.card}>
                <div className={st.cardHead}>
                  <div className={st.coinInfo}>
                    <img src={coin.icon} alt={coin.name} className={st.coinIcon} />
                    <div>
                      <h3 className={st.coinName}>{coin.name}</h3>
                      <p className={st.coinSymbol}>{coin.symbol.toUpperCase()}</p>
                    </div>
                  </div>

                  <label className={st.toggle}>
                    <input
                      type="checkbox"
                      checked={!stakingSettings.disabledCoins.includes(coinKey)}
                      onChange={() => toggleCoinStatus(coinKey)}
                    />
                    <span className={st.slider}></span>
                  </label>
                </div>

                {!stakingSettings.disabledCoins.includes(coinKey) && (
                  <div className={st.rates}>
                    {[
                      { label: "30 Days", key: "thirtyDays" },
                      { label: "60 Days", key: "sixtyDays" },
                      { label: "90 Days", key: "ninetyDays" },
                    ].map(({ label, key }) => (
                      <div key={key} className={st.rate}>
                        <label>{label}</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={getRateForCoin(coinKey, key)}
                          onChange={(e) =>
                            updateCoinRates(coinKey, key, e.target.value)
                          }
                          placeholder="0%"
                        />
                      </div>
                    ))}
                    <button
                      onClick={() => resetCoinRates(coinKey)}
                      className={`${st.btn} ${st.btnReset}`}
                    >
                      Reset to Default
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</div>
    </MemberShell>

    );
};

export default StakingSettings;