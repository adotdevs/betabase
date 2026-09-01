import React, { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import "./style.css";
import styles from "./UserSideBar.module.css";
import { useAuthUser } from "react-auth-kit";
import { signleUsersApi } from "../../../Api/Service";

const UserSideBar = (props) => {
  let authUser = useAuthUser();
  const currentUser = authUser().user;

  // Permission states
  const [permissions, setPermissions] = useState({
    showGeneral: true, // Default show for all
    showTransactions: true, // Default show for all
    showTokens: true, // Default show for all
    loading: true
  });

  const isSubAdmin = currentUser.role === 'subadmin';
  const isAdmin = currentUser.role === 'admin';
  const isSuperAdmin = currentUser.role === 'superadmin';

  // Fetch permissions on component mount
  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        if (isSubAdmin) {
          // For subadmin, fetch permissions to hide/show sidebar links
          const response = await signleUsersApi(currentUser._id);
          if (response.success) {
            const userPermissions = response.signleUser.permissions || {};
            setPermissions({
              showGeneral: userPermissions.viewClientDetails === true,
              showTransactions: userPermissions.addTransaction === true,
              showTokens: false, // Subadmin shouldn't see tokens
              loading: false
            });
          }
        } else if (isAdmin) {
          // For admin, fetch admin permissions
          const response = await signleUsersApi(currentUser._id);
          if (response.success) {
            const adminPermissions = response.signleUser.adminPermissions || {};
            setPermissions({
              showGeneral: adminPermissions.isSubManagement !== false,
              showTransactions: true,
              showTokens: adminPermissions.isTokenManagement !== false,
              loading: false
            });
          }
        } else {
          // Superadmin has all permissions
          setPermissions({
            showGeneral: true,
            showTransactions: true,
            showTokens: true,
            loading: false
          });
        }
      } catch (error) {
        // On error, default to no permissions for safety
        setPermissions({
          showGeneral: false,
          showTransactions: false,
          showTokens: false,
          loading: false
        });
      }
    };

    fetchPermissions();
  }, [currentUser._id, isSubAdmin, isAdmin, isSuperAdmin]);

  const location = useLocation();
  const tabClass = ({ isActive }) =>
    `${styles.tab} datas${isActive ? ` ${styles.tabActive}` : ""}`;
  const onBankAccounts = /\/(bank-accounts|euro-account|usd-account|chf-account|dkk-account)\/?$/.test(
    location.pathname
  );

  return (
    <nav className={styles.topbar} aria-label="Member sections">
      {permissions.loading ? (
        <div className={styles.skelRow} aria-hidden="true">
          <span className={styles.skelItem} />
          <span className={styles.skelItem} />
          <span className={styles.skelItem} />
          <span className={styles.skelItem} />
          <span className={styles.skelItem} />
          <span className={styles.skelItem} />
        </div>
      ) : (
        <div className={styles.scroller}>
          {permissions.showGeneral && (
            <NavLink
              aria-current="page"
              to={`/admin/user/${props.userid}/general`}
              className={tabClass}
            >
              <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" className="icon h-4 w-4" width="1em" height="1em" viewBox="0 0 256 256">
                <g fill="currentColor">
                  <path d="M192 96a64 64 0 1 1-64-64a64 64 0 0 1 64 64" opacity=".2" />
                  <path d="M230.92 212c-15.23-26.33-38.7-45.21-66.09-54.16a72 72 0 1 0-73.66 0c-27.39 8.94-50.86 27.82-66.09 54.16a8 8 0 1 0 13.85 8c18.84-32.56 52.14-52 89.07-52s70.23 19.44 89.07 52a8 8 0 1 0 13.85-8M72 96a56 56 0 1 1 56 56a56.06 56.06 0 0 1-56-56" />
                </g>
              </svg>
              <span>General</span>
            </NavLink>
          )}
          <NavLink to={`/admin/users/${props.userid}/assets`} className={tabClass}>
            <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" className="icon h-4 w-4" width="1em" height="1em" viewBox="0 0 256 256">
              <g fill="currentColor">
                <path d="M88 48v160H40a8 8 0 0 1-8-8V56a8 8 0 0 1 8-8Z" opacity=".2" />
                <path d="M216 40H40a16 16 0 0 0-16 16v144a16 16 0 0 0 16 16h176a16 16 0 0 0 16-16V56a16 16 0 0 0-16-16M40 152h16a8 8 0 0 0 0-16H40v-16h16a8 8 0 0 0 0-16H40V88h16a8 8 0 0 0 0-16H40V56h40v144H40Zm176 48H96V56h120z" />
              </g>
            </svg>
            <span>Wallet</span>
          </NavLink>
          {permissions.showTransactions && (
            <NavLink to={`/admin/users/${props.userid}/transactions`} className={tabClass}>
              <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" className="icon h-4 w-4" width="1em" height="1em" viewBox="0 0 20 20">
                <g fill="currentColor">
                  <path d="M9 2a1 1 0 0 0 0 2h2a1 1 0 1 0 0-2z" />
                  <path fillRule="evenodd" d="M4 5a2 2 0 0 1 2-2a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm3 4a1 1 0 0 0 0 2h.01a1 1 0 1 0 0-2zm3 0a1 1 0 0 0 0 2h3a1 1 0 1 0 0-2zm-3 4a1 1 0 1 0 0 2h.01a1 1 0 1 0 0-2zm3 0a1 1 0 1 0 0 2h3a1 1 0 1 0 0-2z" clipRule="evenodd" />
                </g>
              </svg>
              <span>Transactions</span>
            </NavLink>
          )}
          <NavLink to={`/admin/users/${props.userid}/documents`} className={tabClass}>
            <i className="fa-solid fa-file"></i>
            <span>Documents</span>
          </NavLink>
          <NavLink to={`/admin/users/${props.userid}/loan-application`} className={tabClass}>
            <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" className="icon h-4 w-4 shrink-0" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 4h16v2H4zm0 4h10v2H4zm0 4h16v2H4zm0 4h10v2H4z" />
            </svg>
            <span>Loan</span>
          </NavLink>
          <NavLink to={`/admin/users/${props.userid}/crypto-card`} className={tabClass}>
            <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" className="icon h-4 w-4 shrink-0" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2m0 14H4V6h16zm-6-5h2v2h-2zm-4 0h2v2h-2zm-4 0h2v2H6z" />
            </svg>
            <span>Crypto Card</span>
          </NavLink>
          <NavLink to={`/admin/users/${props.userid}/bank-accounts`} className={() => tabClass({ isActive: onBankAccounts })}>
            <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" className="icon h-4 w-4 shrink-0" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v14a1 1 0 0 1-1.447.894L12 17.618l-6.553 3.276A1 1 0 0 1 4 20zm3-1a1 1 0 0 0-1 1v12.382l5.553-2.776a1 1 0 0 1 .894 0L18 17.382V5a1 1 0 0 0-1-1zm4 3h6v2H11zm0 4h6v2h-6z" />
            </svg>
            <span>Bank Accounts</span>
          </NavLink>
          <NavLink to={`/admin/users/${props.userid}/verifications`} className={tabClass}>
            <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" className="icon h-4 w-4" width="1em" height="1em" viewBox="0 0 256 256">
              <g fill="currentColor">
                <path d="M224 128a96 96 0 1 1-96-96a96 96 0 0 1 96 96" opacity=".2" />
                <path d="M173.66 98.34a8 8 0 0 1 0 11.32l-56 56a8 8 0 0 1-11.32 0l-24-24a8 8 0 0 1 11.32-11.32L112 148.69l50.34-50.35a8 8 0 0 1 11.32 0M232 128A104 104 0 1 1 128 24a104.11 104.11 0 0 1 104 104m-16 0a88 88 0 1 0-88 88a88.1 88.1 0 0 0 88-88" />
              </g>
            </svg>
            <span>Verifications</span>
          </NavLink>
          {permissions.showTokens && (
            <NavLink to={`/admin/users/${props.userid}/tokens`} className={tabClass}>
              <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" className="icon h-4 w-4" width="1em" height="1em" viewBox="0 0 256 256">
                <g fill="currentColor">
                  <path d="M224 128a96 96 0 1 1-96-96a96 96 0 0 1 96 96" opacity=".2" />
                  <path d="M173.66 98.34a8 8 0 0 1 0 11.32l-56 56a8 8 0 0 1-11.32 0l-24-24a8 8 0 0 1 11.32-11.32L112 148.69l50.34-50.35a8 8 0 0 1 11.32 0M232 128A104 104 0 1 1 128 24a104.11 104.11 0 0 1 104 104m-16 0a88 88 0 1 0-88 88a88.1 88.1 0 0 0 88-88" />
                </g>
              </svg>
              <span>Tokens</span>
            </NavLink>
          )}
          <NavLink to={`/admin/users/${props.userid}/staking`} className={tabClass}>
            <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" className="icon h-4 w-4" width="1em" height="1em" viewBox="0 0 256 256">
              <g fill="currentColor">
                <path d="M224 128a96 96 0 1 1-96-96a96 96 0 0 1 96 96" opacity=".2" />
                <path d="M173.66 98.34a8 8 0 0 1 0 11.32l-56 56a8 8 0 0 1-11.32 0l-24-24a8 8 0 0 1 11.32-11.32L112 148.69l50.34-50.35a8 8 0 0 1 11.32 0M232 128A104 104 0 1 1 128 24a104.11 104.11 0 0 1 104 104m-16 0a88 88 0 1 0-88 88a88.1 88.1 0 0 0 88-88" />
              </g>
            </svg>
            <span>Staking</span>
          </NavLink>
        </div>
      )}
    </nav>
  );
};
export default UserSideBar;
