import React, { useEffect, useState } from "react";
import AdminShell from "../theme/AdminShell";
import SideBar from "../../layouts/AdminSidebar/Sidebar";
import UserSideBar from "./UserSideBar";
import AdminHeader from "../adminHeader";
import { useParams } from "react-router-dom";
import { signleUsersApi } from "../../../Api/Service";
import { FIAT_CURRENCIES } from "../../../utils/euroCoinUtils";
import UserFiatBankAccount from "./UserFiatBankAccount";
import su from "./SingleUserLayout.module.css";
import euroStyles from "./UserEuroAccount.module.css";
import box from "./UserBankAccounts.module.css";
import "./style.css";

const UserBankAccounts = () => {
  const { id } = useParams();
  const [Active, setActive] = useState(false);
  const [userName, setUserName] = useState("");

  const toggleBar = () => setActive((prev) => !prev);

  useEffect(() => {
    let alive = true;
    const loadUser = async () => {
      try {
        const userRes = await signleUsersApi(id);
        if (!alive || !userRes.success) return;
        const user = userRes.signleUser;
        setUserName(`${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email);
      } catch (_error) {
        /* account cards still load on their own */
      }
    };
    loadUser();
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <AdminShell>
      <div className="admin">
        <div className="bg-muted-100 pb-20 dark:bg-muted-900">
          <SideBar state={Active} toggle={toggleBar} />
          <div className="relative min-h-screen w-full overflow-x-hidden bg-muted-100 px-4 transition-all duration-300 dark:bg-muted-900 xl:px-10 lg:max-w-[calc(100%_-_280px)] lg:ms-[280px]">
            <div className="mx-auto w-full max-w-7xl">
              <AdminHeader toggle={toggleBar} pageName="User Management" />
              <div className="min-h-screen overflow-hidden pt-2">
                <div className={su.frame}>
                  <UserSideBar userid={id} />
                  <div className={`${su.main} ${euroStyles.euroAccountPage}`}>
                    <div className={euroStyles.heroCard}>
                      <h1 className={euroStyles.heroTitle}>Bank Accounts</h1>
                      <p className={euroStyles.heroSubtitle}>
                        Manage EUR, USD, CHF, and DKK bank details for {userName || "this user"} in one place. Only filled fields appear on the member dashboard.
                      </p>
                    </div>
                    <div className={box.grid}>
                      {FIAT_CURRENCIES.map((fiat) => (
                        <UserFiatBankAccount
                          key={fiat.key}
                          fiatKey={fiat.key}
                          embedded
                          userName={userName}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
};

export default UserBankAccounts;
