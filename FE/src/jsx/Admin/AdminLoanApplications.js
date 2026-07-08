import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SideBar from "../layouts/AdminSidebar/Sidebar";
import AdminHeader from "./adminHeader";
import { deleteLoanApplicationApi, getAllLoanApplicationsApi } from "../../Api/Service";
import { toast } from "react-toastify";
import "./SingleUser/style.css";

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
    submitted: "loan-status-pill loan-status-pill--submitted",
    under_review: "loan-status-pill loan-status-pill--review",
    approved: "loan-status-pill loan-status-pill--approved",
    rejected: "loan-status-pill loan-status-pill--rejected",
    draft: "loan-status-pill loan-status-pill--draft",
  };
  return (
    <span className={classMap[status] || "loan-status-pill loan-status-pill--draft"}>
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
    <div className="admin">
      <div className="bg-muted-100 pb-20 dark:bg-muted-900">
        <SideBar state={Active} toggle={toggleBar} />
        <div className="relative min-h-screen w-full overflow-x-hidden bg-muted-100 px-4 transition-all duration-300 dark:bg-muted-900 xl:px-10 lg:max-w-[calc(100%_-_280px)] lg:ms-[280px]">
          <div className="mx-auto w-full max-w-7xl">
            <AdminHeader toggle={toggleBar} pageName="Loan Applications" />

            <div className="loan-applications-page mt-4 overflow-hidden rounded-xl border border-muted-200 bg-white shadow-sm dark:border-muted-700 dark:bg-muted-900">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-muted-200 px-6 py-5 dark:border-muted-700">
                <div>
                  <h1 className="text-xl font-semibold text-muted-900 dark:text-muted-50">
                    All Loan Applications
                  </h1>
                  <p className="mt-1 text-sm text-muted-500 dark:text-muted-400">
                    {pagination.total} application{pagination.total === 1 ? "" : "s"} found
                  </p>
                </div>
                <select
                  className="loan-applications-filter rounded-lg border border-muted-200 bg-white px-3 py-2 text-sm text-muted-800 dark:border-muted-600 dark:bg-muted-800 dark:text-muted-100"
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
                <p className="py-12 text-center text-sm text-muted-500">Loading...</p>
              ) : applications.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-500">No loan applications found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="loan-applications-table w-full min-w-[920px]">
                    <thead>
                      <tr>
                        <th>Applicant</th>
                        <th>Email</th>
                        <th>Amount</th>
                        <th>Purpose</th>
                        <th>Status</th>
                        <th>Submitted</th>
                        <th className="loan-applications-table__actions">Actions</th>
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
                            <td className="font-medium text-muted-800 dark:text-muted-100">
                              {name || "—"}
                            </td>
                            <td className="text-muted-600 dark:text-muted-300">{user?.email || "—"}</td>
                            <td>{app.loanRequest?.amount || "—"}</td>
                            <td className="max-w-[200px] truncate" title={app.loanRequest?.purpose || ""}>
                              {app.loanRequest?.purpose || "—"}
                            </td>
                            <td>
                              <StatusPill status={app.status} />
                            </td>
                            <td className="whitespace-nowrap text-muted-600 dark:text-muted-300">
                              {app.submittedAt
                                ? new Date(app.submittedAt).toLocaleDateString()
                                : "—"}
                            </td>
                            <td className="loan-applications-table__actions">
                              <div className="loan-list-actions">
                                <Link
                                  to={`/admin/users/${userId}/loan-application`}
                                  className="loan-status-btn loan-list-btn-review"
                                >
                                  Review
                                </Link>
                                <button
                                  type="button"
                                  className="loan-status-btn loan-list-btn-delete"
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
                <div className="loan-applications-pagination flex items-center justify-center gap-3 border-t border-muted-200 px-6 py-4 dark:border-muted-700">
                  <button
                    type="button"
                    className="loan-status-btn loan-status-btn-inactive loan-pagination-btn"
                    disabled={pagination.page <= 1}
                    onClick={() => fetchApplications(pagination.page - 1)}
                  >
                    Previous
                  </button>
                  <span className="text-sm text-muted-500">
                    Page {pagination.page} of {pagination.pages}
                  </span>
                  <button
                    type="button"
                    className="loan-status-btn loan-status-btn-inactive loan-pagination-btn"
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
  );
};

export default AdminLoanApplications;
