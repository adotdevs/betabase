import React, { useEffect, useState } from "react";
import AdminShell from "./theme/AdminShell";
import AdminSkeleton from "./theme/AdminSkeleton";
import SideBar from "../layouts/AdminSidebar/Sidebar";

import {
  getLinksApi,
  updateLinksApi,
} from "../../Api/Service";
import { useNavigate } from "react-router-dom";

import { useAuthUser } from "react-auth-kit";

import "react-responsive-modal/styles.css";
import AdminHeader from "./adminHeader";
import { toast } from "react-toastify";
import styles from "./UserLinks.module.css";

const UserLinks = () => {
  let authUser = useAuthUser();
  let Navigate = useNavigate();
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingNew, setLoadingNew] = useState(false);

  useEffect(() => {
    fetchLinks();
  }, []);

  const fetchLinks = async () => {
    try {
      const data = await getLinksApi();
      setLinks(data.links);
      setLoadingNew(false);
    } catch (error) {
      console.error("Error fetching links:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleLink = async (id, currentStatus) => {
    try {
      let enabled = !currentStatus;
      const linkData = await updateLinksApi(id, enabled);
      setLoadingNew(true);
      if (linkData.success) {
        toast.success("link status updated");
        fetchLinks();
      } else {
        setLoadingNew(false);
      }
    } catch (error) {
      toast.error("Error updating link status");
      setLoadingNew(false);
    }
  };

  useEffect(() => {
    if (authUser().user.role === "user") {
      Navigate("/dashboard");
      return;
    } else if (authUser().user.role === "admin") {
      Navigate("/admin/dashboard");
      return;
    } else if (authUser().user.role === "subadmin") {
      Navigate("/admin/dashboard");
      return;
    }
  }, []);
  const [Active, setActive] = useState(false);
  let toggleBar = () => {
    if (Active === true) {
      setActive(false);
    } else {
      setActive(true);
    }
  };

  return (
    <AdminShell>
      <div className={`admin ${styles.page}`}>
        <div>
          <div className="bg-muted-100 dark:bg-muted-900 pb-20">
            <SideBar state={Active} toggle={toggleBar} />
            <div className="bg-muted-100 dark:bg-muted-900 relative min-h-screen w-full overflow-x-hidden px-4 transition-all duration-300 xl:px-10 lg:max-w-[calc(100%_-_280px)] lg:ms-[280px]">
              <div className="mx-auto w-full max-w-7xl">
                <AdminHeader toggle={toggleBar} pageName="User Links Management" />
                <section className={styles.panel}>
                  <div className={styles.head}>
                    <div>
                      <h1 className={styles.title}>Manage Links</h1>
                      <p className={styles.subtitle}>
                        Turn customer app routes on or off
                      </p>
                    </div>
                    {!loading ? (
                      <span className={styles.count}>{links.length} links</span>
                    ) : null}
                  </div>

                  {loading ? (
                    <AdminSkeleton variant="table" rows={6} />
                  ) : links.length === 0 ? (
                    <p className={styles.empty}>No links to display</p>
                  ) : (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Path</th>
                            <th>Enabled</th>
                          </tr>
                        </thead>
                        <tbody>
                          {links.map((link) => (
                            <tr key={link._id}>
                              <td className={styles.name}>{link.name}</td>
                              <td className={styles.path}>{link.path}</td>
                              <td>
                                <div className={styles.switchWrap}>
                                  <button
                                    type="button"
                                    className={`${styles.switch}${link.enabled ? ` ${styles.switchOn}` : ""}`}
                                    style={{ opacity: loadingNew ? "0.8" : "1" }}
                                    onClick={() => toggleLink(link._id, link.enabled)}
                                    disabled={loadingNew}
                                    aria-pressed={link.enabled}
                                    aria-label={`${link.enabled ? "Disable" : "Enable"} ${link.name}`}
                                  />
                                  <span className={styles.switchLabel}>
                                    {link.enabled ? "On" : "Off"}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
};

export default UserLinks;
