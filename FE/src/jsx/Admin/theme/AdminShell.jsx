import React, { useEffect } from "react";
import { AdminThemeProvider, useAdminTheme } from "./adminTheme";
import theme from "./AdminTheme.module.css";
import ui from "./AdminUI.module.css";
import "../assets/AdminTransactions.module.css";
import "../assets/AdminUserCards.module.css";
import "../SingleUser/SingleUserArea.module.css";

const applyHtmlTheme = (resolvedTheme) => {
  const root = document.documentElement;
  root.setAttribute("data-admin-ui", "on");
  root.setAttribute("data-admin-theme", resolvedTheme);
};

const AdminShellInner = ({ children, open, onClose }) => {
  const { resolvedTheme } = useAdminTheme();

  if (typeof document !== "undefined") {
    applyHtmlTheme(resolvedTheme);
  }

  useEffect(() => {
    applyHtmlTheme(resolvedTheme);
    return () => {
      const root = document.documentElement;
      root.removeAttribute("data-admin-ui");
      root.removeAttribute("data-admin-theme");
    };
  }, [resolvedTheme]);

  return (
    <div
      className={theme.adminShell}
      data-theme={resolvedTheme}
      data-admin-ui="true"
    >
      {open ? (
        <button
          type="button"
          className={ui.backdrop}
          aria-label="Close navigation"
          onClick={onClose}
        />
      ) : null}
      {children}
    </div>
  );
};

const AdminShell = ({ children, open, onClose }) => (
  <AdminThemeProvider>
    <AdminShellInner open={open} onClose={onClose}>
      {children}
    </AdminShellInner>
  </AdminThemeProvider>
);

export default AdminShell;
