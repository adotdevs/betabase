import React, { Fragment, useEffect, useState } from "react";
import SideBar from "./SideBar";
import NavHader from "./NavHader";
import Header from "./Header";
import ChatBox from "../ChatBox";

import bgimg from '../../../assets/images/bg-1.png';
import { useAuthUser } from "react-auth-kit";
import { useNavigate } from "react-router-dom";
import { getRestrictionsApi } from "../../../Api/Service";
import { hasWalletAccess } from "../../../utils/walletAccess";

const JobieNav = ({ title, onClick: ClickToAddEvent, onClick2, onClick3 }) => {
  const [toggle, setToggle] = useState("");
  const onClick = (name) => setToggle(toggle === name ? "" : name);
  let path = window.location.pathname
  path = path.split('/')
  path = path[path.length - 1]
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
  //       // Users stay on wallet pages if they have access (checked by route protection)
  //       return;
  //     } else if (user.role === "admin" || user.role === "subadmin") {
  //       // Check wallet access for admin/subadmin
  //       try {
  //         const globalSettingsResponse = await getRestrictionsApi();
  //         const globalSettings = globalSettingsResponse.success 
  //           ? globalSettingsResponse.data 
  //           : { walletEnabled: true };
          
  //         const hasWallet = hasWalletAccess(user, globalSettings);
          
  //         // If no wallet access, redirect to CRM (if they have CRM access)
  //         if (!hasWallet) {
  //           const hasCrmAccess = (user.role === "admin" && user.adminPermissions?.accessCrm === true) ||
  //             (user.role === "subadmin" && user.permissions?.accessCrm === true);
            
  //           if (hasCrmAccess) {
  //             Navigate("/admin/dashboard/crm");
  //           } else {
  //             Navigate("/auth/login");
  //           }
  //           return;
  //         }
          
  //         // If they have wallet access, let them stay (don't auto-redirect to admin dashboard)
  //       } catch (error) {
  //         console.error("Error checking access:", error);
  //       }
  //     }
  //   };

  //   checkAccessAndRedirect();
  // }, []);
  useEffect(() => {
    if (authUser().user.role === "user") {
      return;
    } else if (authUser().user.role === "admin" || authUser().user.role === "subadmin") {
      Navigate("/admin/dashboard");
      return;
    }
  }, []);
  return (
    <Fragment>
      {
        path === "dashboard" || path === "index-2" ?
          <div className="header-banner" style={{ backgroundImage: `url(${bgimg})` }}></div>
          :
          ""
      }
      <NavHader />
      <ChatBox onClick={() => onClick("chatbox")} toggle={toggle} />
      <Header
        onNote={() => onClick("chatbox")}
        onNotification={() => onClick("notification")}
        onProfile={() => onClick("profile")}
        toggle={toggle}
        title={title}
        onBox={() => onClick("box")}
        onClick={() => ClickToAddEvent()}
      />
      <SideBar />
    </Fragment>
  );
};

export default JobieNav;
