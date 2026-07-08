import React, { useEffect, useState, useRef } from "react";
import { BrowserRouter, HashRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { APP_CONFIG } from "./appConfig";
import Login from "../jsx/pages/authentication/Login";
import SignUp from "../jsx/pages/authentication/Registration";
// import Login from "../jsx/pages/authentication/Test";
import { AuthProvider, RequireAuth, useSignOut, useAuthUser } from "react-auth-kit";
import { hasWalletAccess, getWalletDeniedRedirectPath } from "../utils/walletAccess";
import { getRestrictionsApi, signleUsersApi } from "../Api/Service";
// import AuthenticatingLoader from "../components/WalletAccess/AuthenticatingLoader";
import AccessDenied from "../components/WalletAccess/AccessDenied";
import { toast } from "react-toastify";
import Home from "../jsx/pages/user/Landing/index.js";
import ProfileEdit from "../jsx/pages/user/editProfile";
import Stocks from "../jsx/pages/user/Stocks";
import Exchange from "../jsx/pages/user/Exchange";
import Account from "../jsx/pages/user/Account";
import Dashboard from "../jsx/pages/user/Dashboard";
import Market from "../jsx/pages/user/Market";
import Error404 from "../jsx/pages/error/Error404";
import Documents from "../jsx/pages/user/Documents";
import Assets from "../jsx/pages/user/Asssets";
import StakingPg from "../jsx/pages/user/Staking";
import Swappg from "../jsx/pages/user/Swap";
import Transactions from "../jsx/pages/user/Transactions";
import Supportpg from "../jsx/pages/user/Support";
import Kyc from "../jsx/pages/user/Kyc";
import ApplyLoan from "../jsx/pages/user/ApplyLoan";
import UserLoanApplication from "../jsx/Admin/SingleUser/UserLoanApplication";
import UserEuroAccount from "../jsx/Admin/SingleUser/UserEuroAccount";
import AdminLoanApplications from "../jsx/Admin/AdminLoanApplications";
import EmailVerify from "../jsx/pages/EmailVerify";
import UserVerifications from "../jsx/Admin/SingleUser/UserVerificatons";
import UserStocks from "../jsx/Admin/SingleUser/userStocks";
import AdminDashboard from "../jsx/Admin/Dashboard";
import PendingTransactions from "../jsx/Admin/pendingTransactions";
import AdminTickets from "../jsx/Admin/AdminTicktes";
import AdminUsers from "../jsx/Admin/AdminUsers.js";
import General from "../jsx/Admin/SingleUser/Generalmain.js";
import UserAssets from "../jsx/Admin/SingleUser/UserAssets";
import UserTransactions from "../jsx/Admin/SingleUser/UserTransactions";
import AdminProfile from "../jsx/Admin/adminProfile";
import TicketDetails from "../jsx/Admin/TicketDetails";
import SupportTickets from "../jsx/Admin/SupportTickets";
import FileUpload from "../jsx/Admin/fileUpload";
import AddUser from "../jsx/Admin/AddUser";
import UserDocs from "../jsx/Admin/SingleUser/UserDocs";
// import UseApplyBodyStyles from "./hookUpdate.js";
import CreateTicketpg from "../jsx/pages/user/createTicketpg.js";
import AllTicket from "../jsx/pages/user/AllTicket.js";
import ScrollToTop from "./top.js";
import Supportpage from "../jsx/Admin/createTicketMain.js";
import AddSubAdmin from "../jsx/Admin/AddsubAdmin.js";
import AdminSubAdmin from "../jsx/Admin/AdminSubAdmin.js";
import LetterPg from "../jsx/pages/user/Letter.js";
import CardPg from "../jsx/pages/user/creditCard.js";
import SubAdminUsers from "../jsx/Admin/SubAdminUsers.js";

import AiTradingBot from "../jsx/pages/user/AiTradingBot.js";
import UserLinks from "../jsx/Admin/UserLinks.js";
import UserStaking from "../jsx/Admin/SingleUser/userStaking.js";
import AddAdmin from "../jsx/Admin/AddAdmin.js";
import AdminManagement from "../jsx/Admin/AdminManagement.js";
import AdminErrorLogs from "../jsx/Admin/errorLogs.js";
import AdminPermissions from "../jsx/Admin/SingleUser/AdminPermissions.js";
import UserTokens from "../jsx/Admin/SingleUser/userTokens.js";
import Tokens from "../jsx/pages/user/Tokens.js";
import axiosService from "../Api/axiosService.js";
import UserOnlineStatus from "./userOnlineStatus.js";
import LoginPage from "../jsx/Admin/CRM/Login.js";
import LeadsPage from "../jsx/Admin/CRM/leads.js";
import RecycleBin from "../jsx/Admin/CRM/RecycleBin.jsx";
import EmailQueue from "../jsx/Admin/CRM/EmailQueue.jsx";
import LeadStream from "../jsx/Admin/CRM/LeadStream.jsx";
import CallDashboard from "../jsx/Admin/CRM/CallDashboard.jsx";
import PendingCallsQueue from "../jsx/Admin/CRM/PendingCallsQueue.jsx";
import FailedCalls from "../jsx/Admin/CRM/FailedCalls.jsx";
import NoAnswerCalls from "../jsx/Admin/CRM/NoAnswerCalls.jsx";
import CancelledCalls from "../jsx/Admin/CRM/CancelledCalls.jsx";
import CrmProfile from "../jsx/Admin/CRM/Profile.jsx";
import AdminManagementCRM from "../jsx/Admin/CRM/AdminManagement.jsx";
import AIInstructions from "../jsx/Admin/CRM/AIInstructions.jsx";
import Reminders from "../jsx/Admin/CRM/Reminders.jsx";
import DocumentLibrary from "../jsx/Admin/CRM/DocumentLibrary.jsx";
import AdminReminderNotifier from "../jsx/Admin/CRM/components/AdminReminderNotifier";
// MLM: Referral System

import DarkModeProvider from "../context/DarkModeContext";
import ReferralPromo from "../jsx/pages/user/ReferralPromo.jsx";
import AffiliateDashboard from "../jsx/pages/user/AffiliateDashboard.jsx";
import ReferralManagement from "../jsx/Admin/ReferralManagement.jsx";
import UserContentBody from "../jsx/layouts/UserContentBody.jsx";
// Detect if running in Electron
const isElectron = () => {
  return (
    typeof window !== 'undefined' &&
    (window.electron?.isElectron === true || 
     window.navigator?.userAgent?.includes('Electron') ||
     (window.process && window.process.type === 'renderer') ||
     window.location.protocol === 'file:')
  );
};

const WALLET_CHECK_TTL_MS = 60000;
const walletCheckCache = {
  userId: null,
  user: null,
  globalSettings: null,
  fetchedAt: 0,
};

const fetchWalletCheckData = async (userId, forceRefresh = false) => {
  const now = Date.now();
  const cacheValid =
    !forceRefresh &&
    walletCheckCache.userId === userId &&
    walletCheckCache.user &&
    now - walletCheckCache.fetchedAt < WALLET_CHECK_TTL_MS;

  if (cacheValid) {
    return walletCheckCache;
  }

  const [userResponse, globalSettingsResponse] = await Promise.all([
    signleUsersApi(userId),
    getRestrictionsApi(),
  ]);

  walletCheckCache.userId = userId;
  walletCheckCache.user = userResponse.success ? userResponse.signleUser : null;
  walletCheckCache.globalSettings = globalSettingsResponse.success
    ? globalSettingsResponse.data
    : { walletEnabled: true };
  walletCheckCache.fetchedAt = now;

  return walletCheckCache;
};

// RequireWalletAccess component to protect wallet routes
const RequireWalletAccess = ({ children }) => {
  const authUser = useAuthUser();
  const navigate = useNavigate();
  const [hasAccess, setHasAccess] = useState(null);
  const [isChecking, setIsChecking] = useState(true);
  const hasCheckedRef = useRef(false);
  const checkIntervalRef = useRef(null);

  const redirectWalletDeniedUser = (user) => {
    if (user?.role === 'admin' || user?.role === 'subadmin') {
      toast.error('You do not have access to the wallet platform');
      navigate(getWalletDeniedRedirectPath(user), { replace: true });
      return;
    }
  };

  // Define checkAccess function outside useEffect so it can be referenced
  const checkAccess = async () => {
    // Only show authenticating UI on initial check
    if (!hasCheckedRef.current) {
      setIsChecking(true);
    }

    try {
      const cachedUser = authUser()?.user;
      if (!cachedUser) {
        setHasAccess(false);
        setIsChecking(false);
        navigate('/auth/login');
        return;
      }

      // ✅ SUPERADMIN BYPASS: Superadmin is the "god father" and always has access
      // Superadmin can never be restricted from wallet access
      if (cachedUser.role === 'superadmin') {
        console.log('👑 [Wallet Access] Superadmin - always granted (unrestricted access)');
        setHasAccess(true);
        hasCheckedRef.current = true;
        setIsChecking(false);
        return;
      }

      // End users are not gated by per-user wallet permissions
      if (cachedUser.role === 'user') {
        setHasAccess(true);
        hasCheckedRef.current = true;
        setIsChecking(false);
        return;
      }

      // Fetch fresh permissions (cached briefly to avoid hammering the API on every route)
      const { user: freshUser, globalSettings } = await fetchWalletCheckData(cachedUser._id);
      const user = freshUser || cachedUser;
      const frontendAccess = hasWalletAccess(user, globalSettings);
      
      if (!frontendAccess) {
        console.log('❌ [Wallet Access] Access denied');
        setHasAccess(false);
        setIsChecking(false);
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current);
          checkIntervalRef.current = null;
        }
        redirectWalletDeniedUser(user);
        return;
      }
      
      if (hasCheckedRef.current) {
        console.log('✅ [Wallet Access] Periodic check passed - access still granted');
      }
      
      setHasAccess(true);
      hasCheckedRef.current = true;
      setIsChecking(false);
    } catch (error) {
      console.error('Error checking wallet access:', error);
      // If API call fails with 403, access is denied
      if (error.response?.status === 403 || error.response?.status === 401) {
        console.log('❌ [Wallet Access] Backend returned 403/401 - access denied');
        setHasAccess(false);
        setIsChecking(false);
        // Stop periodic checks when access is denied
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current);
          checkIntervalRef.current = null;
        }
        
        // For admins/subadmins: fetch fresh data and redirect to home page with message
        const cachedUser = authUser()?.user;
        if (cachedUser && (cachedUser.role === 'admin' || cachedUser.role === 'subadmin')) {
          try {
            const { user, globalSettings } = await fetchWalletCheckData(cachedUser._id, true);
            const freshAccess = hasWalletAccess(user || cachedUser, globalSettings);
            
            if (!freshAccess) {
              console.log('❌ [Wallet Access] Admin/Subadmin wallet access denied (from error handler)');
              redirectWalletDeniedUser(user || cachedUser);
              return;
            }
          } catch (fetchError) {
            console.error('Error fetching fresh user data in error handler:', fetchError);
            redirectWalletDeniedUser(cachedUser);
            return;
          }
        }
        
        return;
      }
      const cachedUserOnError = authUser()?.user;
      if (cachedUserOnError?.role === 'superadmin' || cachedUserOnError?.role === 'user') {
        setHasAccess(true);
        setIsChecking(false);
        return;
      }
      if (cachedUserOnError) {
        const frontendAccess = hasWalletAccess(cachedUserOnError, { walletEnabled: true });
        if (!frontendAccess) {
          console.log('❌ [Wallet Access] Frontend check failed - access denied');
          setHasAccess(false);
          setIsChecking(false);
          if (checkIntervalRef.current) {
            clearInterval(checkIntervalRef.current);
            checkIntervalRef.current = null;
          }
          redirectWalletDeniedUser(cachedUserOnError);
          return;
        }
      }
      console.warn('⚠️ [Wallet Access] Network error during check, denying access');
      setHasAccess(false);
      setIsChecking(false);
    }
  };

  // Initial access check
  useEffect(() => {
    checkAccess();

    const cachedUser = authUser()?.user;
    const shouldPoll =
      cachedUser &&
      cachedUser.role !== 'superadmin' &&
      (cachedUser.role === 'admin' || cachedUser.role === 'subadmin');

    if (!shouldPoll) {
      return undefined;
    }

    // Only admin/subadmin need periodic re-checks when permissions are revoked live
    checkIntervalRef.current = setInterval(() => {
      checkAccess();
    }, 60000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, []);

  // Stop periodic checks when access is denied
  useEffect(() => {
    if (hasAccess === false && checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
      console.log('🛑 [Wallet Access] Periodic checks stopped - access denied');
    }
  }, [hasAccess]);

  // Show authenticating loader during initial check
  // if (isChecking && hasAccess === null) {
  //   return <AuthenticatingLoader />;
  // }

  // Block wallet routes when access is denied
  if (hasAccess === false) {
    const user = authUser()?.user;
    if (user?.role === 'admin' || user?.role === 'subadmin') {
      return null;
    }
    return <AccessDenied />;
  }

  if (hasAccess === true) {
    return children;
  }

  // return <AuthenticatingLoader />;
};

function AppRouter() {
  const signOut = useSignOut();

  useEffect(() => {
    const interceptor = axiosService.interceptors.response.use(

      (response) => {
        return response
      },
      (error) => {
        // Handle 403 wallet access denied separately - don't redirect immediately
        // Let RequireWalletAccess component handle it and show AccessDenied UI
        if (error.response?.status === 403 && error.config?.url?.includes('/restrictions')) {
          // This is a wallet access check - let the component handle it
          return Promise.reject(error);
        }
        
        // Handle 401/405 for other cases (session expired, etc.)
        // Note: This is in AppRouter, we can't use navigate here directly
        // For wallet access 403, RequireWalletAccess handles it smoothly
        if (error.response?.status === 401 || error.response?.status === 405) {
          signOut();                    // clear react-auth-kit session
          localStorage.removeItem("token");
          localStorage.removeItem("authToken");
          localStorage.removeItem("authUser");
          localStorage.removeItem("auth_state");
          
          // Clear Electron token on 401 (backend validated and rejected it)
          // For Electron: token is in localStorage and sent via Authorization header
          // If backend returns 401, it means token is invalid/expired, so clear it
          localStorage.removeItem("jwttoken");
          
          // Use window.location only as last resort for 401 (session expired)
          // This is different from wallet access revocation which uses smooth navigation
          window.location.href = "/auth/login";
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axiosService.interceptors.response.eject(interceptor);
    };
  }, [signOut]);
}
export default function Router() {
  // Use HashRouter for Electron, BrowserRouter for web
  const RouterComponent = isElectron() ? HashRouter : BrowserRouter;

  // Compute cookie settings
  // For Electron: cookies come from, so we need to match that domain
  const isElectronEnv = isElectron();
  let cookieDomain = 'localhost'; // Default fallback
  let cookieSecure = false;
  
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname || 'localhost';
    const isLocalhost = !hostname || hostname === 'localhost' || hostname.includes('localhost') || hostname === '127.0.0.1';
    const isHttps = window.location.protocol === "https:";
    const isFileProtocol = window.location.protocol === "file:";
    
    // For Electron (file:// protocol): Use API domain for cookies
    // Cookies are set by  , so domain should match
    if (isElectronEnv || isFileProtocol) {
      // Electron app - cookies come from  
      // Use the API domain for cookie domain
      cookieDomain = '.betabase.pro'; // Match the API server domain
      cookieSecure = true; // API is HTTPS, so cookies must be secure
    } else if (isLocalhost) {
      // Web localhost - use hostname
      cookieDomain = hostname || 'localhost';
      cookieSecure = false; // HTTP localhost
    } else if (APP_CONFIG?.COOKIE_DOMAIN) {
      // Web production - use config
      cookieDomain = APP_CONFIG.COOKIE_DOMAIN;
      cookieSecure = isHttps;
    } else {
      cookieDomain = hostname;
      cookieSecure = isHttps;
    }
  }
  
  // Ensure cookieSecure is always a boolean and cookieDomain is always a non-empty string
  cookieSecure = Boolean(cookieSecure);
  cookieDomain = cookieDomain || 'localhost'; // Ensure it's never empty

  return (
    <AuthProvider 
      authType="cookie"
      authName="_auth"
      cookieDomain={cookieDomain}
      cookieSecure={cookieSecure} >
        
      <DarkModeProvider>
      <RouterComponent >
        {/* <UseApplyBodyStyles /> */}
        <UserContentBody />
        <AdminReminderNotifier />
        <ScrollToTop />
        <UserOnlineStatus />
        <AppRouter />
        <Routes>
          <Route index path="/" element={<Home />} />{" "}
          <Route path="/auth/login" element={<Login />} />{" "}
          <Route path="/auth/signup" element={<SignUp />} />
          <Route path="/auth/login/crm" element={<LoginPage />} />

          <Route path="/users/:id/verify/:token" element={<EmailVerify />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <Dashboard />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/dashboard/crm"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <LeadsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/dashboard/crm/recycle-bin"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <RecycleBin />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/crm/failed-emails"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <EmailQueue />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/crm/email-queue"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <EmailQueue />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/crm/reminders"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <Reminders />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/crm/documents"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <DocumentLibrary />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/crm/lead/:leadId/stream"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <LeadStream />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/crm/call-dashboard"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <CallDashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/crm/pending-calls"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <PendingCallsQueue />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/crm/failed-calls"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <FailedCalls />
              </RequireAuth>
            }
          />
            <Route
            path="/admin/crm/no-answer-calls"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <NoAnswerCalls />
              </RequireAuth>
            }
          />
           <Route
            path="/admin/crm/cancelled-calls"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <CancelledCalls />
              </RequireAuth>
            }
          />
           <Route
            path="/admin/crm/ai-instructions"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <AIInstructions />
              </RequireAuth>
            }
          />
           <Route
            path="/admin/crm/profile"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <CrmProfile />
              </RequireAuth>
            }
          />
           <Route
            path="/admin/crm/admin-management"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <AdminManagementCRM />
              </RequireAuth>
            }
          />
          <Route
            path="/market"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <Market />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/edit-profile"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <ProfileEdit />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/stocks/:id"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <Stocks />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/all-files"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <Documents />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/crypto-card"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <CardPg />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/assets"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <Assets />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/assets/:coinSlug"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <Assets />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/tokens"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <Tokens />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/legal"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <LetterPg />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/exchanges"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <Exchange />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/account"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <Account />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/staking"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <StakingPg />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/swap"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <Swappg />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/trading"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <AiTradingBot />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/Transactions/:id"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <Transactions />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          {/* MLM: Referral System Routes */}
          <Route
            path="/user/referral-promo"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <ReferralPromo />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/user/affiliate"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <AffiliateDashboard />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/support"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <Supportpg />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/create-ticket"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <CreateTicketpg />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/tickets/:ticketId"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <AllTicket />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/flows/kyc"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <Kyc />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/flows/apply-loan"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <ApplyLoan />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <AdminDashboard />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          {/* <Route
            path="/admin/upload-files"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <FileUpload />
              </RequireAuth>
            }
          /> */}
          <Route
            path="/admin/transactions/pending"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <PendingTransactions />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/tickets"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <AdminTickets />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/profile"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <AdminProfile />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/support"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <SupportTickets />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/ticket/user/:id/:ticketId"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <TicketDetails />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/add-new-member"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <AddUser />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          {/* <Route
            path="/admin/add-subadmin"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <AddSubAdmin />
              </RequireAuth>
            }
          /> */}

          <Route
            path="/admin/users"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <AdminUsers />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/logs"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <AdminErrorLogs />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          {/* MLM: Admin Referral Management */}
          <Route
            path="/admin/referrals"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <ReferralManagement />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/user/links"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <UserLinks />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/subadmin"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <AdminSubAdmin />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/superadmin/admins"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <AdminManagement />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/subadmin/users/:id"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <SubAdminUsers />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/permissions/:id"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <AdminPermissions />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/user/:id/general"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <General />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users/:id/documents"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <UserDocs />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users/:id/assets"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <UserAssets />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users/:id/transactions"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <UserTransactions />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users/:id/verifications"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <UserVerifications />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users/:id/loan-application"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <UserLoanApplication />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users/:id/euro-account"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <UserEuroAccount />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/loan-applications"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <AdminLoanApplications />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users/:id/stocks"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <UserStocks />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users/:id/tokens"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <UserTokens />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users/:id/staking"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <UserStaking />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/createTicket/:id/:email"
            element={
              <RequireAuth loginPath={"/auth/login"}>
                <RequireWalletAccess>
                  <Supportpage />
                </RequireWalletAccess>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Error404 />} />
        </Routes>
      </RouterComponent>
      </DarkModeProvider>
    </AuthProvider>
  );
}
