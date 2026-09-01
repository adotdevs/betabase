import React, { useEffect, useState } from "react";
import AdminShell from "./theme/AdminShell";
import AdminSkeleton from "./theme/AdminSkeleton";
import { Link } from "react-router-dom";
import SideBar from "../layouts/AdminSidebar/Sidebar";
import AdminHeader from "./adminHeader";
import { deleteLoanApplicationApi, getAllLoanApplicationsApi } from "../../Api/Service";
import { toast } from "react-toastify";
import styles from "./AdminLoanUI.module.css";

const STATUS_OPTIONS = [
  { value: "", label: "All (non-draft)" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const STATUS_LABELS = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
};

const StatusPill = ({ status }) => {
  const classMap = {
    submitted: `${styles.pill} ${styles.pillSubmitted}`,
    under_review: `${styles.pill} ${styles.pillReview}`,
    approved: `${styles.pill} ${styles.pillApproved}`,
    rejected: `${styles.pill} ${styles.pillRejected}`,
    draft: `${styles.pill} ${styles.pillDraft}`,
  };
  return (
    <span className={classMap[status] || `${styles.pill} ${styles.pillDraft}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
};

const AdminLoanApplications = () => {
  const [Active, setActive] = useState(false);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [deletingId, setDeletingId] = useState(null);

  const toggleBar = () => setActive((prev) => !prev);

  const fetchApplications = async (page = 1, status = statusFilter) => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (status) params.status = status;
      const res = await getAllLoanApplicationsApi(params);
      if (res.success) {
        setApplications(res.applications || []);
        setPagination(res.pagination || { page: 1, pages: 1, total: 0 });
      } else {
        toast.error(res.msg || "Failed to load applications");
      }
    } catch (error) {
      toast.error(error?.msg || "Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications(1, statusFilter);
  }, [statusFilter]);

  const handleDelete = async (app) => {
    const user = app.userId;
    const name = user
      ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
      : "this user";
    const confirmed = window.confirm(
      `Delete the loan application for ${name || "this user"}? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(app._id);
    try {
      const res = await deleteLoanApplicationApi(app._id);
      if (res.success) {
        toast.success(res.msg || "Loan application deleted");
        fetchApplications(pagination.page, statusFilter);
      } else {
        toast.error(res.msg || "Failed to delete application");
      }
    } catch (error) {
      toast.error(error?.msg || "Failed to delete application");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AdminShell><div className={`admin ${styles.page}`}>
      <div className="bg-muted-100 pb-20 dark:bg-muted-900">
        <SideBar state={Active} toggle={toggleBar} />
        <div className="relative min-h-screen w-full overflow-x-hidden bg-muted-100 px-4 transition-all duration-300 dark:bg-muted-900 xl:px-10 lg:max-w-[calc(100%_-_280px)] lg:ms-[280px]">
          <div className="mx-auto w-full max-w-7xl">
            <AdminHeader toggle={toggleBar} pageName="Loan Applications" />

            <div className={styles.panel}>
              <div className={styles.head}>
                <div>
                  <h1 className={styles.title}>
                    All Loan Applications
                  </h1>
                  <p className={styles.subtitle}>
                    {pagination.total} application{pagination.total === 1 ? "" : "s"} found
                  </p>
                </div>
                <select
                  className={styles.filter}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value || "all"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {loading ? (
                <AdminSkeleton variant="table" rows={6} />
              ) : applications.length === 0 ? (
                <p className={styles.empty}>No loan applications found.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Applicant</th>
                        <th>Email</th>
                        <th>Amount</th>
                        <th>Purpose</th>
                        <th>Status</th>
                        <th>Submitted</th>
                        <th className={styles.actions}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applications.map((app) => {
                        const user = app.userId;
                        const userId = user?._id || app.userId;
                        const name = user
                          ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
                          : "—";
                        return (
                          <tr key={app._id}>
                            <td>
                              {name || "—"}
                            </td>
                            <td className={styles.cellMuted}>{user?.email || "—"}</td>
                            <td>{app.loanRequest?.amount || "—"}</td>
                            <td className={styles.purpose} title={app.loanRequest?.purpose || ""}>
                              {app.loanRequest?.purpose || "—"}
                            </td>
                            <td>
                              <StatusPill status={app.status} />
                            </td>
                            <td className={styles.cellMuted}>
                              {app.submittedAt
                                ? new Date(app.submittedAt).toLocaleDateString()
                                : "—"}
                            </td>
                            <td className={styles.actions}>
                              <div className={styles.actionRow}>
                                <Link
                                  to={`/admin/users/${userId}/loan-application`}
                                  className={styles.reviewBtn}
                                >
                                  Review
                                </Link>
                                <button
                                  type="button"
                                  className={styles.deleteBtn}
                                  disabled={deletingId === app._id}
                                  onClick={() => handleDelete(app)}
                                >
                                  {deletingId === app._id ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {pagination.pages > 1 && (
                <div className={styles.pager}>
                  <button
                    type="button"
                    className={styles.pagerBtn}
                    disabled={pagination.page <= 1}
                    onClick={() => fetchApplications(pagination.page - 1)}
                  >
                    Previous
                  </button>
                  <span className={styles.pagerMeta}>
                    Page {pagination.page} of {pagination.pages}
                  </span>
                  <button
                    type="button"
                    className={styles.pagerBtn}
                    disabled={pagination.page >= pagination.pages}
                    onClick={() => fetchApplications(pagination.page + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    </AdminShell>
  );
};

export default AdminLoanApplications;
