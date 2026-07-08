import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuthUser } from "react-auth-kit";
import { getMyComplianceStatusApi } from "../../Api/Service";
import "./styles.css";

const BANNER_HEIGHT_VAR = "--compliance-banner-height";
const BANNER_ACTIVE_CLASS = "compliance-banner-active";

const setBannerLayout = (active, height = 0) => {
  document.documentElement.classList.toggle(BANNER_ACTIVE_CLASS, active);
  document.documentElement.style.setProperty(BANNER_HEIGHT_VAR, `${height}px`);
};

const UserContentBody = () => {
  const authUser = useAuthUser();
  const location = useLocation();
  const bannerRef = useRef(null);
  const [isRestricted, setIsRestricted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchComplianceStatus = useCallback(async () => {
    const sessionUser = authUser()?.user;
    if (!sessionUser || sessionUser.role !== "user") {
      setIsRestricted(false);
      setIsLoading(false);
      return;
    }

    try {
      const response = await getMyComplianceStatusApi();
      setIsRestricted(response.success && response.isComplianceRestricted === true);
    } catch {
      setIsRestricted(false);
    } finally {
      setIsLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    fetchComplianceStatus();
  }, [fetchComplianceStatus, location.pathname]);

  useEffect(() => {
    const sessionUser = authUser()?.user;
    if (!sessionUser || sessionUser.role !== "user") {
      return undefined;
    }

    const intervalId = setInterval(fetchComplianceStatus, 60000);
    return () => clearInterval(intervalId);
  }, [authUser, fetchComplianceStatus]);

  useLayoutEffect(() => {
    if (isLoading || !isRestricted) {
      setBannerLayout(false, 0);
      return undefined;
    }

    const el = bannerRef.current;
    if (!el) {
      return undefined;
    }

    const updateHeight = () => {
      setBannerLayout(true, el.getBoundingClientRect().height);
    };

    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    window.addEventListener("resize", updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeight);
      setBannerLayout(false, 0);
    };
  }, [isLoading, isRestricted]);

  useEffect(() => () => setBannerLayout(false, 0), []);

  if (isLoading || !isRestricted) {
    return null;
  }

  return (
    <>
      <div ref={bannerRef} className="compliance-restriction-banner" role="alert">
        <p>
          Your account is under review due to concerns related to potential money laundering activities.
          Failure to provide the requested information or resolve these concerns may result in account closure.
          Please contact our{" "}
          <Link to="/support">compliance team</Link> immediately.
        </p>
      </div>
      <div className="compliance-banner-spacer" aria-hidden="true" />
    </>
  );
};

export default UserContentBody;
