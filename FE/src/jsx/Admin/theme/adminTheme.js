import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "admin-ui-theme";
const AdminThemeContext = createContext(null);

const readPreference = () => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") {
      return value;
    }
  } catch (_error) {
    /* ignore */
  }
  return "system";
};

const getSystemTheme = () => {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export const useAdminThemeState = () => {
  const [preference, setPreference] = useState(readPreference);
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      setSystemTheme(media.matches ? "dark" : "light");
    };
    if (media.addEventListener) {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  const setThemePreference = (next) => {
    if (next !== "light" && next !== "dark" && next !== "system") return;
    setPreference(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (_error) {
      /* ignore */
    }
  };

  const resolvedTheme = preference === "system" ? systemTheme : preference;

  return useMemo(
    () => ({ preference, resolvedTheme, setThemePreference }),
    [preference, resolvedTheme]
  );
};

export const AdminThemeProvider = ({ children }) => {
  const value = useAdminThemeState();
  return (
    <AdminThemeContext.Provider value={value}>
      {children}
    </AdminThemeContext.Provider>
  );
};

export const useAdminTheme = () => {
  const context = useContext(AdminThemeContext);
  return context;
};
