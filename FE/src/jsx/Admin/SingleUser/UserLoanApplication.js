import React, { useEffect, useState } from "react";
import SideBar from "../../layouts/AdminSidebar/Sidebar";
import UserSideBar from "./UserSideBar";
import { useParams } from "react-router-dom";
import {
  deleteLoanApplicationApi,
  getLoanApplicationByUserApi,
  getLoanDocumentApi,
  signleUsersApi,
  updateLoanApplicationStatusApi,
} from "../../../Api/Service";
import {
  getKycDocumentPreviewUrl,
  isCloudinaryPdfUrl,
} from "../../../utils/cloudinaryKyc";
import { toast } from "react-toastify";
import AdminHeader from "../adminHeader";
import "./style.css";

const STATUS_ACTIONS = [
  { value: "submitted", label: "Submitted", activeClass: "loan-status-btn-active loan-status-btn-active--submitted" },
  { value: "under_review", label: "Under Review", activeClass: "loan-status-btn-active loan-status-btn-active--review" },
  { value: "approved", label: "Approve", activeClass: "loan-status-btn-active loan-status-btn-active--approved" },
  { value: "rejected", label: "Reject", activeClass: "loan-status-btn-active loan-status-btn-active--rejected" },
];

const DOCUMENT_FIELD_KEYS = new Set(["idDocumentUrl", "evidenceUrls"]);

const SECTION_LABELS = {
  personalInfo: "Personal Information",
  identity: "Identity Verification",
  employment: "Employment",
  income: "Income Details",
  housing: "Housing",
  obligations: "Financial Obligations",
  assets: "Assets & Savings",
  loanRequest: "Loan Request",
  banking: "Banking Information",
  declarations: "Declarations",
  affordability: "Affordability Assessment",
};

const FIELD_LABELS = {
  fullLegalName: "Full legal name",
  dateOfBirth: "Date of birth",
  nationality: "Nationality",
  residentialAddress: "Residential address",
  phone: "Phone",
  email: "Email",
  maritalStatus: "Marital status",
  numberOfDependents: "Dependents",
  idNumber: "ID number",
  countryOfIssuance: "Country of issuance",
  expiryDate: "Expiry date",
  taxIdentificationNumber: "Tax ID",
  employmentStatus: "Employment status",
  employerName: "Employer",
  jobTitle: "Job title",
  lengthOfEmployment: "Length of employment",
  industry: "Industry",
  netMonthlyIncome: "Net monthly income",
  otherIncomeSources: "Other income",
  paymentFrequency: "Payment frequency",
  homeStatus: "Home status",
  monthlyMortgageOrRent: "Monthly mortgage/rent",
  lengthOfResidence: "Length of residence",
  currentLoans: "Current loans",
  creditCardBalances: "Credit card balances",
  monthlyDebtRepayments: "Monthly debt repayments",
  guarantees: "Guarantees",
  alimonyOrChildSupport: "Alimony/child support",
  bankAccountBalances: "Bank balances",
  investments: "Investments",
  realEstateOwned: "Real estate",
  otherAssets: "Other assets",
  amount: "Loan amount",
  term: "Term",
  purpose: "Purpose",
  repaymentFrequency: "Repayment frequency",
  iban: "IBAN",
  bankName: "Bank name",
  accountHolderName: "Account holder",
  informationAccurate: "Information accurate",
  creditAssessmentConsent: "Credit assessment consent",
  identityVerificationConsent: "Identity verification consent",
  privacyNoticeAcknowledged: "Privacy notice acknowledged",
  electronicCommunicationConsent: "Electronic communication consent",
  averageMonthlyNetIncome: "Avg. monthly net income",
  totalMonthlyLivingExpenses: "Total living expenses",
  currentMonthlyDebtRepayments: "Current debt repayments",
  missedRepaymentsLast24Months: "Missed repayments (24 mo)",
  insolvencyProceedings: "Insolvency proceedings",
};

const DocumentIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    width="32"
    height="32"
    aria-hidden="true"
    className="loan-doc-fallback-icon text-muted-400"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const DownloadIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    width="16"
    height="16"
    aria-hidden="true"
    className="loan-doc-download-icon"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
  </svg>
);

const collectLoanDocuments = (application) => {
  if (!application) return [];

  const docs = [];

  if (application.identity?.idDocumentUrl) {
    docs.push({
      docSlot: "identity",
      title: "Government ID",
      subtitle: "Identity verification document",
      url: application.identity.idDocumentUrl,
      fileLabel: "identity-document",
    });
  }

  (application.income?.evidenceUrls || []).forEach((url, index) => {
    if (!url) return;
    docs.push({
      docSlot: `evidence-${index}`,
      title: `Income Evidence ${index + 1}`,
      subtitle: "Proof of income",
      url,
      fileLabel: `income-evidence-${index + 1}`,
    });
  });

  return docs;
};

const StatusBadge = ({ status }) => {
  const styles = {
    draft: "bg-muted-100 text-muted-700 dark:bg-muted-800 dark:text-muted-300",
    submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    under_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  };
  const labels = {
    draft: "Draft",
    submitted: "Submitted",
    under_review: "Under Review",
    approved: "Approved",
    rejected: "Rejected",
  };
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${styles[status] || styles.draft}`}>
      {labels[status] || status}
    </span>
  );
};

const DocumentPreviewCard = ({ doc, userId, onPreviewError }) => {
  const isPdf = isCloudinaryPdfUrl(doc.url);
  const previewUrl = isPdf ? getKycDocumentPreviewUrl(doc.url, 320) : doc.url;
  const [hasError, setHasError] = useState(false);

  const downloadDocument = () => {
    getLoanDocumentApi(userId, doc.docSlot)
      .then((response) => {
        const blobData = response?.data;
        if (!(blobData instanceof Blob)) {
          toast.error("Could not download document");
          return;
        }

        const contentType = response?.headers?.["content-type"] || "";
        const ext = contentType.includes("pdf")
          ? "pdf"
          : contentType.includes("png")
            ? "png"
            : contentType.includes("webp")
              ? "webp"
              : "jpg";
        const blob =
          blobData.type && blobData.type !== "application/octet-stream"
            ? blobData
            : new Blob([blobData], { type: isPdf ? "application/pdf" : `image/${ext}` });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = `${doc.fileLabel}.${ext}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
      })
      .catch(() => toast.error("Failed to download document"));
  };

  return (
    <div className="loan-doc-card group flex flex-col overflow-hidden rounded-xl border border-muted-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-muted-700 dark:bg-muted-900">
      <div className="flex items-start justify-between gap-2 border-b border-muted-200 px-4 py-3 dark:border-muted-700">
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold text-muted-800 dark:text-muted-100">
            {doc.title}
          </h4>
          <p className="mt-0.5 truncate text-xs text-muted-500 dark:text-muted-400">
            {doc.subtitle}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            isPdf
              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
          }`}
        >
          {isPdf ? "PDF" : "Image"}
        </span>
      </div>

      <button
        type="button"
        onClick={downloadDocument}
        className="loan-doc-preview-btn relative block w-full border-0 bg-muted-50 p-3 transition-colors hover:bg-muted-100 dark:bg-muted-800/50 dark:hover:bg-muted-800"
        title="Click to download"
      >
        <div className="loan-doc-preview-area flex h-[132px] items-center justify-center overflow-hidden rounded-md">
          {hasError || !previewUrl ? (
            <div className="flex flex-col items-center gap-1.5 text-center">
              <DocumentIcon />
              <span className="text-xs text-muted-500">Preview unavailable</span>
            </div>
          ) : (
            <>
              <img
                src={previewUrl}
                alt={`${doc.title} preview`}
                className="loan-doc-preview-image"
                onError={() => {
                  setHasError(true);
                  onPreviewError?.(doc.docSlot);
                }}
              />
              <span className="pointer-events-none absolute inset-x-3 bottom-3 rounded bg-black/55 px-2 py-1 text-center text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                Click to download
              </span>
            </>
          )}
        </div>
      </button>

      <div className="border-t border-muted-200 px-4 py-2.5 dark:border-muted-700">
        <button
          type="button"
          onClick={downloadDocument}
          className="loan-doc-download-btn flex w-full items-center justify-center gap-2 rounded-md border border-info-500/20 bg-info-500/10 px-3 py-2 text-xs font-medium text-info-600 transition hover:bg-info-500 hover:text-white dark:text-info-400 dark:hover:text-white"
        >
          <DownloadIcon />
          <span>View &amp; Download</span>
        </button>
      </div>
    </div>
  );
};

const UserLoanApplication = () => {
  const { id } = useParams();
  const [Active, setActive] = useState(false);
  const [isDisable, setisDisable] = useState(false);
  const [UserData, setUserData] = useState({});
  const [application, setApplication] = useState(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [loading, setLoading] = useState(true);

  const toggleBar = () => setActive((prev) => !prev);

  const loadData = async () => {
    try {
      const [userRes, loanRes] = await Promise.all([
        signleUsersApi(id),
        getLoanApplicationByUserApi(id).catch(() => ({ success: false })),
      ]);
      if (userRes.success) setUserData(userRes.signleUser);
      if (loanRes.success && loanRes.application) {
        setApplication(loanRes.application);
        setAdminNotes(loanRes.application.adminNotes || "");
      }
    } catch (error) {
      toast.error(error?.msg || "Failed to load loan application");
    } finally {
      setLoading(false);
      setisDisable(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const updateStatus = async (status) => {
    if (!application?._id) return;
    if (application.status === status) {
      toast.info(`Application is already ${status.replace("_", " ")}`);
      return;
    }
    setisDisable(true);
    try {
      const res = await updateLoanApplicationStatusApi(application._id, { status, adminNotes });
      if (res.success) {
        toast.success(res.msg || `Application ${status}`);
        loadData();
      } else {
        toast.error(res.msg || "Failed to update status");
        setisDisable(false);
      }
    } catch (error) {
      toast.error(error?.msg || "Failed to update status");
      setisDisable(false);
    }
  };

  const deleteApplication = async () => {
    if (!application?._id) return;
    const confirmed = window.confirm(
      "Delete this loan application permanently? This cannot be undone."
    );
    if (!confirmed) return;

    setisDisable(true);
    try {
      const res = await deleteLoanApplicationApi(application._id);
      if (res.success) {
        toast.success(res.msg || "Loan application deleted");
        setApplication(null);
        setAdminNotes("");
        setisDisable(false);
      } else {
        toast.error(res.msg || "Failed to delete application");
        setisDisable(false);
      }
    } catch (error) {
      toast.error(error?.msg || "Failed to delete application");
      setisDisable(false);
    }
  };

  const formatValue = (key, value) => {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  };

  const userName = [UserData.firstName, UserData.lastName].filter(Boolean).join(" ");
  const canChangeStatus = application && application.status !== "draft";
  const loanDocuments = collectLoanDocuments(application);

  const renderSection = (sectionKey) => {
    const data = application?.[sectionKey];
    if (!data || typeof data !== "object") return null;
    const entries = Object.entries(data).filter(
      ([key, v]) => !DOCUMENT_FIELD_KEYS.has(key) && v !== "" && v !== null && v !== undefined
    );
    if (!entries.length) return null;

    return (
      <div
        key={sectionKey}
        className="overflow-hidden rounded-xl border border-muted-200 bg-white shadow-sm dark:border-muted-700 dark:bg-muted-900"
      >
        <div className="border-b border-muted-200 px-5 py-4 dark:border-muted-700">
          <h3 className="font-heading text-base font-semibold text-muted-800 dark:text-muted-100">
            {SECTION_LABELS[sectionKey]}
          </h3>
        </div>
        <dl className="grid gap-4 p-5 sm:grid-cols-2">
          {entries.map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-500 dark:text-muted-400">
                {FIELD_LABELS[key] || key}
              </dt>
              <dd className="mt-1 text-sm text-muted-800 dark:text-muted-100">{formatValue(key, value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  };

  return (
    <div className="admin">
      <div className="bg-muted-100 pb-20 dark:bg-muted-900">
        <SideBar state={Active} toggle={toggleBar} />
        <div className="relative min-h-screen w-full overflow-x-hidden bg-muted-100 px-4 transition-all duration-300 dark:bg-muted-900 xl:px-10 lg:max-w-[calc(100%_-_280px)] lg:ms-[280px]">
          <div className="mx-auto w-full max-w-7xl">
            <AdminHeader toggle={toggleBar} pageName="User Management" />

            <div className="min-h-screen overflow-hidden pt-2">
              <div className="grid gap-8 sm:grid-cols-12">
                <UserSideBar userid={id} />

                <div className="col-span-12 sm:col-span-8">
                  <div className="space-y-6">
                    <div className="overflow-hidden rounded-xl border border-muted-200 bg-white shadow-sm dark:border-muted-700 dark:bg-muted-900">
                      <div className="border-b border-muted-200 px-6 py-5 dark:border-muted-700">
                        <div className="flex flex-col gap-4">
                          <div>
                            <h1 className="font-heading text-xl font-semibold text-muted-900 dark:text-muted-50">
                              Loan Application
                            </h1>
                            <p className="mt-1 text-sm text-muted-500 dark:text-muted-400">
                              Review loan request{userName ? ` for ${userName}` : ""}.
                            </p>
                            {application && (
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <StatusBadge status={application.status} />
                                {application.submittedAt && (
                                  <span className="text-xs text-muted-500 dark:text-muted-400">
                                    Submitted {new Date(application.submittedAt).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {canChangeStatus && (
                            <div className="space-y-3 border-t border-muted-200 pt-4 dark:border-muted-700">
                              <label className="block text-sm font-medium text-muted-700 dark:text-muted-300">
                                Admin notes (optional)
                              </label>
                              <textarea
                                className="w-full rounded-lg border border-muted-200 bg-white px-3 py-2 text-sm text-muted-800 dark:border-muted-700 dark:bg-muted-800 dark:text-muted-100"
                                rows={3}
                                value={adminNotes}
                                onChange={(e) => setAdminNotes(e.target.value)}
                                placeholder="Internal notes about this application..."
                              />
                              <p className="text-xs text-muted-500 dark:text-muted-400">
                                Current status: <strong>{application.status.replace("_", " ")}</strong>
                                — you can change it at any time.
                              </p>
                              <div className="loan-status-panel">
                                <div className="loan-status-actions loan-status-actions-grid">
                                  {STATUS_ACTIONS.map(({ value, label, activeClass }) => {
                                    const isActive = application.status === value;
                                    return (
                                      <button
                                        key={value}
                                        type="button"
                                        disabled={isDisable}
                                        onClick={() => updateStatus(value)}
                                        className={`loan-status-btn inline-flex h-10 items-center justify-center rounded-md border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                          isActive ? activeClass : "loan-status-btn-inactive"
                                        }`}
                                      >
                                        {label}
                                        {isActive ? " ✓" : ""}
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="loan-status-delete-row">
                                  <button
                                    type="button"
                                    disabled={isDisable}
                                    onClick={deleteApplication}
                                    className="loan-status-btn loan-status-btn-delete inline-flex h-10 min-w-[180px] items-center justify-center rounded-md border px-4 text-sm font-medium disabled:opacity-60"
                                  >
                                    Delete Application
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {application && application.status === "draft" && (
                            <div className="loan-status-delete-row border-t border-muted-200 pt-4 dark:border-muted-700">
                              <button
                                type="button"
                                disabled={isDisable}
                                onClick={deleteApplication}
                                className="loan-status-btn loan-status-btn-delete inline-flex h-10 min-w-[140px] items-center justify-center rounded-md border px-4 text-sm font-medium disabled:opacity-60"
                              >
                                Delete Draft
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {loading && (
                        <div className="px-6 py-12 text-center text-sm text-muted-500">Loading...</div>
                      )}

                      {!loading && !application && (
                        <div className="px-6 py-12 text-center">
                          <h2 className="text-lg font-semibold text-muted-800 dark:text-muted-100">
                            No loan application
                          </h2>
                          <p className="mt-2 text-sm text-muted-500 dark:text-muted-400">
                            This user has not submitted a loan application yet.
                          </p>
                        </div>
                      )}

                      {!loading && application?.status === "draft" && (
                        <div className="px-6 py-8 text-center text-sm text-muted-500">
                          Application is still in draft — not yet submitted by the user.
                        </div>
                      )}
                    </div>

                    {!loading && application && application.status !== "draft" && loanDocuments.length > 0 && (
                      <div className="overflow-hidden rounded-xl border border-muted-200 bg-white shadow-sm dark:border-muted-700 dark:bg-muted-900">
                        <div className="border-b border-muted-200 px-5 py-4 dark:border-muted-700">
                          <h3 className="font-heading text-base font-semibold text-muted-800 dark:text-muted-100">
                            Supporting Documents
                          </h3>
                          <p className="mt-0.5 text-sm text-muted-500 dark:text-muted-400">
                            Click a preview or use View &amp; Download to save the file.
                          </p>
                        </div>
                        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
                          {loanDocuments.map((doc) => (
                            <DocumentPreviewCard key={doc.docSlot} doc={doc} userId={id} />
                          ))}
                        </div>
                      </div>
                    )}

                    {!loading && application && application.status !== "draft" && (
                      <div className="space-y-4">
                        {Object.keys(SECTION_LABELS).map(renderSection)}
                        {application.adminNotes && (
                          <div className="rounded-xl border border-muted-200 bg-muted-50 px-5 py-4 dark:border-muted-700 dark:bg-muted-800/50">
                            <p className="text-xs font-medium uppercase text-muted-500">Admin notes</p>
                            <p className="mt-1 text-sm text-muted-800 dark:text-muted-100">{application.adminNotes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserLoanApplication;
