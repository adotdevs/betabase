import React, { useContext, useEffect } from "react";
import Nav from "../../layouts/nav";
import Footer from "../../layouts/Footer";
import { ThemeContext } from "../../../context/ThemeContext";
import Home from "../dashboard/Home";
import { useSelector } from "react-redux";
import Market from "../dashboard/Market";
import { useAuthUser } from "react-auth-kit";
import { useNavigate } from "react-router-dom";
import ExchangeArea from "../apps/ExchangeArea";

const Exchange = () => {
    const { sidebariconHover } = useContext(ThemeContext);
    const sideMenu = useSelector((state) => state.sideMenu);
    const authUser = useAuthUser();
    const Navigate = useNavigate();

    useEffect(() => {
        if (authUser().user.role === "user") {
            return;
        } else if (authUser().user.role === "admin"|| authUser().user.role === "superadmin"|| authUser().user.role === "subadmin") {
            Navigate("/admin/dashboard");
            return;
        }
    }, []);
    return (
          <div
            id="main-wrapper"
            className={`show ${sidebariconHover ? "iconhover-toggle" : ""
                } ${sideMenu ? "menu-toggle" : ""}`}
        >
            <Nav />
<div className="content-body new-bg-light">
        <div className="container-fluid" style={{ minHeight: window.screen.height - 45 }}>
<ExchangeArea />
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Exchange;
