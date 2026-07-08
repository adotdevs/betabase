import React, { useContext, useEffect, useState } from "react";
import Nav from "../../layouts/nav";
import RightWalletBar from "../../layouts/nav/RightWalletBar_my.jsx";
import Footer from "../../layouts/Footer";
import { ThemeContext } from "../../../context/ThemeContext";
import { useSelector } from "react-redux";
import { useAuthUser } from "react-auth-kit";
import { useNavigate } from "react-router-dom";
import { getLinksApi } from "../../../Api/Service";
import ApplyLoanSec from "../dashboard/ApplyLoanSec.js";
import { Spinner } from "react-bootstrap";

const isLoanLinkEnabled = (links) => {
  if (!Array.isArray(links)) return false;
  const loanLink =
    links.find((l) => l.name === "Apply For Loan" || l.path === "/flows/apply-loan") ||
    links[10];
  return Boolean(loanLink?.enabled);
};

const ApplyLoan = () => {
  const { sidebariconHover, headWallet } = useContext(ThemeContext);
  const sideMenu = useSelector((state) => state.sideMenu);
  const authUser = useAuthUser();
  const Navigate = useNavigate();
  const [isLoading, setisLoading] = useState(true);
  const [linkAllowed, setLinkAllowed] = useState(false);

  useEffect(() => {
    const fetchLinks = async () => {
      try {
        const data = await getLinksApi();
        if (isLoanLinkEnabled(data?.links)) {
          setLinkAllowed(true);
        } else {
          Navigate("/dashboard");
        }
      } catch (error) {
        console.error("Error fetching links:", error);
        Navigate("/dashboard");
      }
    };
    fetchLinks();
  }, [Navigate]);

  useEffect(() => {
    if (!linkAllowed) return undefined;

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        getLinksApi().then((data) => {
          if (!isLoanLinkEnabled(data?.links)) {
            Navigate("/dashboard");
          }
        });
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(async () => {
      try {
        const data = await getLinksApi();
        if (!isLoanLinkEnabled(data?.links)) {
          Navigate("/dashboard");
        }
      } catch {
        /* ignore transient errors */
      }
    }, 15000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [linkAllowed, Navigate]);

  useEffect(() => {
    if (authUser().user.role === "user") {
      return;
    }
    if (["admin", "superadmin", "subadmin"].includes(authUser().user.role)) {
      Navigate("/admin/dashboard");
    }
  }, []);

  return (
    <>
      {isLoading || !linkAllowed ? (
        <div
          className="d-flex justify-content-center align-items-center"
          style={{ height: "100vh" }}
        >
          <Spinner animation="border" variant="primary" />
          {linkAllowed && (
            <div style={{ opacity: 0, position: "absolute", left: "-2000%" }}>
              <ApplyLoanSec isLoading={isLoading} setisLoading={setisLoading} />
            </div>
          )}
        </div>
      ) : (
        <div
          id="main-wrapper"
          className={`show wallet-open ${headWallet ? "" : "active"} ${
            sidebariconHover ? "iconhover-toggle" : ""
          } ${sideMenu ? "menu-toggle" : ""}`}
        >
          <Nav />
          <RightWalletBar />
<div className="content-body new-bg-light">
            <div
              className="container-fluid"
              style={{
                minHeight: window.screen.height - 45,
                paddingBottom: "3rem",
              }}
            >
              <ApplyLoanSec isLoading={isLoading} setisLoading={setisLoading} />
            </div>
          </div>
          <Footer />
        </div>
      )}
    </>
  );
};

export default ApplyLoan;
