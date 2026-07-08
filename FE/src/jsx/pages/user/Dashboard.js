import React, { useContext, useEffect, useState } from "react";
import Nav from "./../../layouts/nav";
import RightWalletBar from "../../layouts/nav/RightWalletBar_my";
import Footer from "./../../layouts/Footer";
import { ThemeContext } from "../../../context/ThemeContext";
import Home from "../dashboard/Home";
import { useSelector } from "react-redux";
import { getAllDataApi, getRestrictionsApi } from "../../../Api/Service";
import { useAuthUser } from "react-auth-kit";
import { useNavigate } from "react-router-dom";
import { hasWalletAccess } from "../../../utils/walletAccess";

const Dashboard = () => {
  const { sidebariconHover, headWallet } = useContext(ThemeContext);
  const sideMenu = useSelector((state) => state.sideMenu);
  const authUser = useAuthUser();
  const Navigate = useNavigate();

  // DISABLED: Permission checking is disabled to prevent flickering
  // useEffect(() => {
  //   const checkAccessAndRedirect = async () => {
  //     const user = authUser()?.user;
  //     if (!user) {
  //       return;
  //     }

  //     if (user.role === "user") {
  //       // Check wallet access for users
  //       try {
  //         const globalSettingsResponse = await getRestrictionsApi();
  //         const globalSettings = globalSettingsResponse.success 
  //           ? globalSettingsResponse.data 
  //           : { walletEnabled: true };
          
  //         if (!hasWalletAccess(user, globalSettings)) {
  //           Navigate("/auth/login");
  //           return;
  //         }
  //       } catch (error) {
  //         console.error("Error checking wallet access:", error);
  //       }
  //       return;
  //     } else if (user.role === "admin" || user.role === "subadmin" || user.role === "superadmin") {
  //       // Check if admin/subadmin has wallet access, if not redirect to CRM
  //       try {
  //         const globalSettingsResponse = await getRestrictionsApi();
  //         const globalSettings = globalSettingsResponse.success 
  //           ? globalSettingsResponse.data 
  //           : { walletEnabled: true };
          
  //         const hasWallet = hasWalletAccess(user, globalSettings);
          
  //         // If no wallet access, redirect to CRM (if they have CRM access)
  //         if (!hasWallet) {
  //           // Check if they have CRM access
  //           const hasCrmAccess = user.role === "superadmin" || 
  //             (user.role === "admin" && user.adminPermissions?.accessCrm === true) ||
  //             (user.role === "subadmin" && user.permissions?.accessCrm === true);
            
  //           if (hasCrmAccess) {
  //             Navigate("/admin/dashboard/crm");
  //           } else {
  //             Navigate("/auth/login");
  //           }
  //           return;
  //         }
          
  //         // If they have wallet access, they can stay on dashboard
  //         // But superadmin and admins with CRM access might want to go to admin dashboard
  //         // For now, let them stay on wallet dashboard if they have access
  //       } catch (error) {
  //         console.error("Error checking access:", error);
  //       }
  //     }
  //   };

  //   checkAccessAndRedirect();
  // }, []);
  return (
  <div
    id="main-wrapper"
    className={`show wallet-open ${headWallet ? "" : "active"} ${sidebariconHover ? "iconhover-toggle" : ""
      } ${sideMenu ? "menu-toggle" : ""}`}
  >
    <Nav />
    <RightWalletBar />
    <div className="content-body new-bg-light">
      <div className="container-fluid" style={{ minHeight: window.screen.height - 45 }}>
<Home />
      </div>
    </div>
    <Footer />
  </div>
  );
};

export default Dashboard;
