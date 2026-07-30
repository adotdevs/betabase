import { useEffect } from "react";

const toStaticHelpPath = () => {
  let path = window.location.pathname.replace(/\/+$/, "") || "/help";

  if (!path.startsWith("/help")) {
    path = "/help";
  }

  if (path.endsWith(".html")) {
    return path;
  }

  return `${path}/index.html`;
};

const HelpStaticRedirect = () => {
  useEffect(() => {
    const target = `${toStaticHelpPath()}${window.location.search}${window.location.hash}`;
    window.location.replace(target);
  }, []);

  return null;
};

export default HelpStaticRedirect;
