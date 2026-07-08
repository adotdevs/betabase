import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthUser } from "react-auth-kit";
import { toast } from "react-toastify";
import {
  getLinksApi,
  getMyLoanApplicationApi,
  getsignUserApi,
  saveMyLoanApplicationApi,
  submitMyLoanApplicationApi,
  uploadLoanDocumentApi,
} from "../../../Api/Service";
import styles from "./ApplyLoanSec.module.css";

const STEPS = [
  { key: "personalInfo", title: "Personal", desc: "Your contact and identity details" },
  { key: "identity", title: "ID Verify", desc: "Government ID and documentation" },
  { key: "employment", title: "Employment", desc: "Work and income source" },
  { key: "income", title: "Income", desc: "Earnings and supporting documents" },
  { key: "housing", title: "Housing", desc: "Residence and housing costs" },
  { key: "obligations", title: "Debts", desc: "Existing financial obligations" },
  { key: "assets", title: "Assets", desc: "Savings and owned property" },
  { key: "loanRequest", title: "Loan", desc: "Amount, term, and purpose" },
  { key: "banking", title: "Banking", desc: "Account for disbursement" },
  { key: "declarations", title: "Review", desc: "Affordability and consents" },
];

const EMPTY_FORM = {
  personalInfo: {
    fullLegalName: "",
    dateOfBirth: "",
    nationality: "",
    residentialAddress: "",
    phone: "",
    email: "",
    maritalStatus: "",
    numberOfDependents: "",
  },
  identity: {
    idNumber: "",
    countryOfIssuance: "",
    expiryDate: "",
    taxIdentificationNumber: "",
    idDocumentUrl: "",
  },
  employment: {
    employmentStatus: "",
    employerName: "",
    jobTitle: "",
    lengthOfEmployment: "",
    industry: "",
  },
  income: {
    netMonthlyIncome: "",
    otherIncomeSources: "",
    paymentFrequency: "",
    evidenceUrls: [],
  },
  housing: {
    homeStatus: "",
    monthlyMortgageOrRent: "",
    lengthOfResidence: "",
  },
  obligations: {
    currentLoans: "",
    creditCardBalances: "",
    monthlyDebtRepayments: "",
    guarantees: "",
    alimonyOrChildSupport: "",
  },
  assets: {
    bankAccountBalances: "",
    investments: "",
    realEstateOwned: "",
    otherAssets: "",
  },
  loanRequest: {
    amount: "",
    term: "",
    purpose: "",
    repaymentFrequency: "",
  },
  banking: {
    iban: "",
    bankName: "",
    accountHolderName: "",
  },
  declarations: {
    informationAccurate: false,
    creditAssessmentConsent: false,
    identityVerificationConsent: false,
    privacyNoticeAcknowledged: false,
    electronicCommunicationConsent: false,
  },
  affordability: {
    averageMonthlyNetIncome: "",
    totalMonthlyLivingExpenses: "",
    currentMonthlyDebtRepayments: "",
    missedRepaymentsLast24Months: "",
    insolvencyProceedings: "",
  },
};

const STATUS_CONFIG = {
  submitted: {
    badge: styles.badgeSubmitted,
    icon: styles.statusIconSubmitted,
    iconChar: "⏳",
    title: "Application Submitted",
    message:
      "Your loan application has been received and is waiting in our review queue. We will notify you once an advisor begins processing it.",
    panel: styles.infoPanelBlue,
    panelText:
      "Typical review time is 2–5 business days. You can return here anytime to check your application status.",
  },
  under_review: {
    badge: styles.badgeReview,
    icon: styles.statusIconReview,
    iconChar: "🔍",
    title: "Under Review",
    message:
      "Our team is currently reviewing your application, documents, and affordability information.",
    panel: styles.infoPanelBlue,
    panelText:
      "You may be contacted if additional documentation is required. No action is needed from you at this time.",
  },
  approved: {
    badge: styles.badgeApproved,
    icon: styles.statusIconApproved,
    iconChar: "✓",
    title: "Application Approved",
    message:
      "Congratulations — your loan application has been approved. Our team will contact you regarding next steps and disbursement.",
    panel: styles.infoPanelGreen,
    panelText:
      "Funds will be processed according to your selected banking details after final verification.",
  },
  rejected: {
    badge: styles.badgeRejected,
    icon: styles.statusIconRejected,
    iconChar: "✕",
    title: "Application Not Approved",
    message:
      "Unfortunately, your loan application was not approved at this time. You may submit a new application with updated information.",
    panel: styles.infoPanelRed,
    panelText:
      "If you have questions about this decision, please contact support through your dashboard.",
  },
};

const mergeForm = (saved) => {
  const merged = JSON.parse(JSON.stringify(EMPTY_FORM));
  if (!saved) return merged;
  Object.keys(EMPTY_FORM).forEach((section) => {
    merged[section] = { ...merged[section], ...(saved[section] || {}) };
  });
  merged.income.evidenceUrls = saved?.income?.evidenceUrls || [];
  return merged;
};

const sanitizeNumericInput = (value) => {
  if (value === "") return "";
  let cleaned = String(value).replace(/[^\d.]/g, "");
  const dotIndex = cleaned.indexOf(".");
  if (dotIndex !== -1) {
    const whole = cleaned.slice(0, dotIndex);
    const fraction = cleaned.slice(dotIndex + 1).replace(/\./g, "").slice(0, 2);
    cleaned = `${whole}.${fraction}`;
  }
  return cleaned;
};

const currencyWord = (currency) => (currency === "EUR" ? "euro" : "dollar");

const moneyLabel = (label, currency) => `${label} (${currencyWord(currency)})`;

const isLoanLinkEnabled = (links) => {
  if (!Array.isArray(links)) return false;
  const loanLink =
    links.find((l) => l.name === "Apply For Loan" || l.path === "/flows/apply-loan") ||
    links[10];
  return Boolean(loanLink?.enabled);
};

const isLoanAccessDeniedResponse = (res) =>
  res?.statusCode === 403 ||
  (res?.success === false &&
    String(res?.msg || res?.message || "")
      .toLowerCase()
      .includes("not available"));

const Field = ({
  label,
  name,
  fieldId,
  value,
  onChange,
  type = "text",
  as,
  rows,
  required,
  options,
  className,
  error,
  numericOnly,
  min,
  max,
  step,
}) => {
  const inputId = fieldId || `loan-field-${name}`;
  const isDate = type === "date";
  const hasError = Boolean(error);
  const errorClass = hasError ? ` ${styles.inputError}` : "";
  const inputClassName = isDate
    ? `${styles.input} ${styles.dateInput}${errorClass}`
    : `${styles.input}${errorClass}`;

  const handleInputChange = numericOnly
    ? (e) => {
        onChange({
          ...e,
          target: {
            name: e.target.name,
            value: sanitizeNumericInput(e.target.value),
            type: "text",
          },
        });
      }
    : onChange;

  const inputType = numericOnly ? "text" : type;
  const inputMode = numericOnly ? "decimal" : undefined;
  const inputValue = value == null ? "" : String(value);

  return (
    <div className={`${styles.fieldGroup} ${className || ""}`}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
        {required ? <span className={styles.required}>*</span> : null}
      </label>
      {options ? (
        <select
          id={inputId}
          className={`${styles.select}${errorClass}`}
          name={name}
          value={value}
          onChange={onChange}
        >
          <option value="">Select...</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : as === "textarea" ? (
        <textarea
          id={inputId}
          className={`${styles.textarea}${errorClass}`}
          name={name}
          rows={rows || 3}
          value={value}
          onChange={onChange}
        />
      ) : (
        <input
          id={inputId}
          className={inputClassName}
          type={inputType}
          inputMode={inputMode}
          name={name}
          value={inputValue}
          onChange={handleInputChange}
          min={min}
          max={max}
          step={step}
        />
      )}
      {hasError ? <p className={styles.fieldError}>{error}</p> : null}
    </div>
  );
};

const UploadField = ({ label, required, error, className, children }) => (
  <div className={`${styles.fieldGroup} ${className || ""}`}>
    <span className={styles.label}>
      {label}
      {required ? <span className={styles.required}>*</span> : null}
    </span>
    {children}
    {error ? <p className={styles.fieldError}>{error}</p> : null}
  </div>
);

const LoanStatusView = ({ status, form, meta, onStartNew }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.submitted;
  const badgeLabel = status?.replace("_", " ") || "Unknown";

  return (
    <div className={styles.wrapper}>
      <section className={styles.statusShell}>
        <div className={styles.statusHero}>
          <div className={`${styles.statusIcon} ${cfg.icon}`}>{cfg.iconChar}</div>
          <div className={styles.statusHeroContent}>
            <span className={`${styles.statusBadge} ${cfg.badge}`}>{badgeLabel}</span>
            <h2 className={styles.statusTitle}>{cfg.title}</h2>
            <p className={styles.statusMessage}>{cfg.message}</p>
          </div>
        </div>

        <div className={styles.statusBody}>
          <div className={`${styles.infoPanel} ${cfg.panel}`}>{cfg.panelText}</div>

          <div className={styles.summaryGrid}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Loan Amount</span>
            <span className={styles.summaryValue}>{form.loanRequest?.amount || "—"}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Term</span>
            <span className={styles.summaryValue}>{form.loanRequest?.term || "—"}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Purpose</span>
            <span className={styles.summaryValue}>{form.loanRequest?.purpose || "—"}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Submitted</span>
            <span className={styles.summaryValue}>
              {meta?.submittedAt ? new Date(meta.submittedAt).toLocaleString() : "—"}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Applicant</span>
            <span className={styles.summaryValue}>{form.personalInfo?.fullLegalName || "—"}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Reference</span>
            <span className={styles.summaryValue}>{meta?.id ? meta.id.slice(-8).toUpperCase() : "—"}</span>
          </div>
        </div>

        {meta?.adminNotes && (
          <div className={`${styles.infoPanel} ${styles.infoPanelRed}`}>
            <strong>Admin note:</strong> {meta.adminNotes}
          </div>
        )}

        <div className={styles.statusActions}>
          {status === "rejected" && (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onStartNew}>
              Start New Application
            </button>
          )}
          <Link to="/dashboard" className={`${styles.btn} ${styles.btnGhost}`}>
            Back to Dashboard
          </Link>
        </div>
        </div>
      </section>
    </div>
  );
};

const ApplyLoanSec = ({ isLoading, setisLoading }) => {
  const authUser = useAuthUser();
  const Navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [applicationStatus, setApplicationStatus] = useState(null);
  const [applicationMeta, setApplicationMeta] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [userCurrency, setUserCurrency] = useState("USD");

  const skipAutoSaveRef = useRef(true);
  const autoSaveTimerRef = useRef(null);
  const formRef = useRef(form);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  const handleLoanAccessDenied = useCallback(
    (message) => {
      skipAutoSaveRef.current = true;
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      toast.error(message || "Loan applications are no longer available");
      Navigate("/dashboard");
    },
    [Navigate]
  );

  const checkLoanAccess = useCallback(async () => {
    try {
      const data = await getLinksApi();
      if (!isLoanLinkEnabled(data?.links)) {
        handleLoanAccessDenied("Loan applications are no longer available");
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }, [handleLoanAccessDenied]);

  const loadApplication = async () => {
    try {
      const linksData = await getLinksApi();
      if (!isLoanLinkEnabled(linksData?.links)) {
        handleLoanAccessDenied("Loan applications are not available");
        return;
      }

      const userFormData = new FormData();
      userFormData.append("id", authUser().user._id);
      const [res, userRes] = await Promise.all([
        getMyLoanApplicationApi(),
        getsignUserApi(userFormData),
      ]);

      if (isLoanAccessDeniedResponse(res)) {
        handleLoanAccessDenied(res.msg);
        return;
      }

      if (userRes?.success && userRes.signleUser?.currency) {
        setUserCurrency(userRes.signleUser.currency === "EUR" ? "EUR" : "USD");
      }

      if (res.success && res.application) {
        setForm(mergeForm(res.application));
        setApplicationStatus(res.application.status);
        setApplicationMeta({
          id: res.application._id,
          submittedAt: res.application.submittedAt,
          adminNotes: res.application.adminNotes,
          reviewedAt: res.application.reviewedAt,
        });
      } else {
        setForm({
          ...mergeForm(null),
          personalInfo: {
            ...EMPTY_FORM.personalInfo,
            email: authUser().user.email || "",
            fullLegalName: `${authUser().user.firstName || ""} ${authUser().user.lastName || ""}`.trim(),
            phone: authUser().user.phone || "",
          },
        });
      }
    } catch {
      toast.error("Failed to load application");
    } finally {
      setisLoading(false);
      setTimeout(() => {
        skipAutoSaveRef.current = false;
      }, 800);
    }
  };

  useEffect(() => {
    loadApplication();
  }, []);

  useEffect(() => {
    if (isLoading) return undefined;

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        checkLoanAccess();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(checkLoanAccess, 15000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [isLoading, checkLoanAccess]);

  const saveDraft = useCallback(async (silent = false) => {
    if (["submitted", "under_review", "approved", "rejected"].includes(applicationStatus)) {
      return;
    }
    if (!(await checkLoanAccess())) {
      return;
    }
    setIsSaving(true);
    try {
      const res = await saveMyLoanApplicationApi(formRef.current);
      if (isLoanAccessDeniedResponse(res)) {
        handleLoanAccessDenied(res.msg);
        return;
      }
      if (res.success) {
        setApplicationMeta((prev) => ({ ...prev, id: res.application?._id }));
        setApplicationStatus(res.application?.status || "draft");
        setLastSavedAt(new Date());
        if (!silent) toast.success("Progress saved");
      } else if (!silent) {
        toast.error(res.msg || "Failed to save");
      }
    } catch {
      if (!silent) toast.error("Failed to save");
    } finally {
      setIsSaving(false);
    }
  }, [applicationStatus, checkLoanAccess, handleLoanAccessDenied]);

  useEffect(() => {
    if (skipAutoSaveRef.current || isLoading) return;
    if (["submitted", "under_review", "approved", "rejected"].includes(applicationStatus)) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveDraft(true);
    }, 1400);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [form, isLoading, applicationStatus, saveDraft]);

  const handleChange = (section) => (e) => {
    const { name, value, type, checked } = e.target;
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [name]: type === "checkbox" ? checked : value,
      },
    }));
  };

  const goNext = () => {
    setFieldErrors({});
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goToStep = (index) => {
    if (index <= step) {
      setFieldErrors({});
      setStep(index);
    }
  };

  const handleSubmit = async () => {
    if (!(await checkLoanAccess())) {
      return;
    }
    setIsSaving(true);
    try {
      const res = await submitMyLoanApplicationApi(form);
      if (isLoanAccessDeniedResponse(res)) {
        handleLoanAccessDenied(res.msg);
        return;
      }
      if (res.success) {
        toast.success(res.msg || "Application submitted");
        setApplicationStatus(res.application?.status);
        setApplicationMeta({
          id: res.application?._id,
          submittedAt: res.application?.submittedAt,
          adminNotes: res.application?.adminNotes,
        });
        setFieldErrors({});
      } else {
        toast.error(res.msg || "Failed to submit");
      }
    } catch (error) {
      toast.error(error?.msg || "Failed to submit");
    } finally {
      setIsSaving(false);
    }
  };

  const uploadEvidence = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!(await checkLoanAccess())) {
      e.target.value = "";
      return;
    }
    setUploadingEvidence(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadLoanDocumentApi(fd);
      if (isLoanAccessDeniedResponse(res)) {
        handleLoanAccessDenied(res.msg);
        return;
      }
      if (res.success && res.url) {
        setForm((prev) => ({
          ...prev,
          income: {
            ...prev.income,
            evidenceUrls: [...(prev.income.evidenceUrls || []), res.url],
          },
        }));
        setFieldErrors((prev) => {
          if (!prev.evidenceUrls) return prev;
          const next = { ...prev };
          delete next.evidenceUrls;
          return next;
        });
        toast.success("Document uploaded");
      } else {
        toast.error(res.msg || "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploadingEvidence(false);
      e.target.value = "";
    }
  };

  const uploadIdDocument = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!(await checkLoanAccess())) {
      e.target.value = "";
      return;
    }
    setUploadingEvidence(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadLoanDocumentApi(fd);
      if (isLoanAccessDeniedResponse(res)) {
        handleLoanAccessDenied(res.msg);
        return;
      }
      if (res.success && res.url) {
        setForm((prev) => ({
          ...prev,
          identity: { ...prev.identity, idDocumentUrl: res.url },
        }));
        setFieldErrors((prev) => {
          if (!prev.idDocumentUrl) return prev;
          const next = { ...prev };
          delete next.idDocumentUrl;
          return next;
        });
        toast.success("ID document uploaded");
      } else {
        toast.error(res.msg || "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploadingEvidence(false);
      e.target.value = "";
    }
  };

  const startNewApplication = async () => {
    if (!(await checkLoanAccess())) {
      return;
    }
    skipAutoSaveRef.current = true;
    setApplicationStatus(null);
    setApplicationMeta(null);
    setForm({
      ...mergeForm(null),
      personalInfo: {
        ...EMPTY_FORM.personalInfo,
        email: authUser().user.email || "",
        fullLegalName: `${authUser().user.firstName || ""} ${authUser().user.lastName || ""}`.trim(),
        phone: authUser().user.phone || "",
      },
    });
    setStep(0);
    setFieldErrors({});
    setTimeout(() => {
      skipAutoSaveRef.current = false;
    }, 800);
  };

  const employmentRequiresEmployer = ["Employed", "Self-employed"].includes(
    form.employment.employmentStatus
  );

  const renderStep = () => {
    const err = fieldErrors;
    const cur = userCurrency;
    switch (step) {
      case 0:
        return (
          <div className={styles.formGrid}>
            <Field label="Full legal name" name="fullLegalName" value={form.personalInfo.fullLegalName} onChange={handleChange("personalInfo")} required error={err.fullLegalName} />
            <Field fieldId="loan-personal-dateOfBirth" label="Date of birth" name="dateOfBirth" type="date" value={form.personalInfo.dateOfBirth} onChange={handleChange("personalInfo")} required error={err.dateOfBirth} />
            <Field label="Nationality" name="nationality" value={form.personalInfo.nationality} onChange={handleChange("personalInfo")} required error={err.nationality} />
            <Field label="Phone number" name="phone" value={form.personalInfo.phone} onChange={handleChange("personalInfo")} required error={err.phone} />
            <Field label="Residential address" name="residentialAddress" as="textarea" rows={2} value={form.personalInfo.residentialAddress} onChange={handleChange("personalInfo")} required className={styles.formGridFull} error={err.residentialAddress} />
            <Field label="Email address" name="email" type="email" value={form.personalInfo.email} onChange={handleChange("personalInfo")} required error={err.email} />
            <Field label="Marital status" name="maritalStatus" value={form.personalInfo.maritalStatus} onChange={handleChange("personalInfo")} options={["Single", "Married", "Divorced", "Widowed", "Other"]} required error={err.maritalStatus} />
            <Field label="Number of dependents" name="numberOfDependents" type="number" min="0" step="1" value={form.personalInfo.numberOfDependents} onChange={handleChange("personalInfo")} required error={err.numberOfDependents} />
          </div>
        );
      case 1:
        return (
          <div className={styles.formGrid}>
            <Field label="Government-issued ID number" name="idNumber" value={form.identity.idNumber} onChange={handleChange("identity")} required error={err.idNumber} />
            <Field label="Country of issuance" name="countryOfIssuance" value={form.identity.countryOfIssuance} onChange={handleChange("identity")} required error={err.countryOfIssuance} />
            <Field fieldId="loan-identity-expiryDate" label="Expiry date" name="expiryDate" type="date" value={form.identity.expiryDate} onChange={handleChange("identity")} required error={err.expiryDate} />
            <Field label="Tax Identification Number" name="taxIdentificationNumber" value={form.identity.taxIdentificationNumber} onChange={handleChange("identity")} />
            <UploadField label="Upload ID document" required className={styles.formGridFull} error={err.idDocumentUrl}>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={uploadIdDocument}
                disabled={uploadingEvidence}
                className={`${styles.input} ${styles.fileInput}${err.idDocumentUrl ? ` ${styles.inputError}` : ""}`}
              />
              {form.identity.idDocumentUrl && <p className={styles.uploadOk}>✓ ID document uploaded</p>}
            </UploadField>
          </div>
        );
      case 2:
        return (
          <div className={styles.formGrid}>
            <Field label="Employment status" name="employmentStatus" value={form.employment.employmentStatus} onChange={handleChange("employment")} options={["Employed", "Self-employed", "Retired", "Unemployed", "Student"]} required error={err.employmentStatus} />
            <Field label="Employer name" name="employerName" value={form.employment.employerName} onChange={handleChange("employment")} required={employmentRequiresEmployer} error={err.employerName} />
            <Field label="Job title" name="jobTitle" value={form.employment.jobTitle} onChange={handleChange("employment")} required={employmentRequiresEmployer} error={err.jobTitle} />
            <Field label="Length of employment" name="lengthOfEmployment" value={form.employment.lengthOfEmployment} onChange={handleChange("employment")} required={employmentRequiresEmployer} error={err.lengthOfEmployment} />
            <Field label="Industry" name="industry" value={form.employment.industry} onChange={handleChange("employment")} required={employmentRequiresEmployer} className={styles.formGridFull} error={err.industry} />
          </div>
        );
      case 3:
        return (
          <div className={styles.formGrid}>
            <Field label={moneyLabel("Net monthly income", cur)} name="netMonthlyIncome" value={form.income.netMonthlyIncome} onChange={handleChange("income")} required numericOnly error={err.netMonthlyIncome} />
            <Field label="Frequency of income payments" name="paymentFrequency" value={form.income.paymentFrequency} onChange={handleChange("income")} options={["Weekly", "Bi-weekly", "Monthly", "Other"]} required error={err.paymentFrequency} />
            <Field label="Other income sources" name="otherIncomeSources" value={form.income.otherIncomeSources} onChange={handleChange("income")} className={styles.formGridFull} />
            <UploadField label="Evidence of income" required className={styles.formGridFull} error={err.evidenceUrls}>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={uploadEvidence}
                disabled={uploadingEvidence}
                className={`${styles.input} ${styles.fileInput}${err.evidenceUrls ? ` ${styles.inputError}` : ""}`}
              />
              {(form.income.evidenceUrls || []).length > 0 && (
                <p className={styles.uploadOk}>✓ {form.income.evidenceUrls.length} document(s) uploaded</p>
              )}
            </UploadField>
          </div>
        );
      case 4:
        return (
          <div className={styles.formGrid}>
            <Field label="Homeowner or renter" name="homeStatus" value={form.housing.homeStatus} onChange={handleChange("housing")} options={["Homeowner", "Renter", "Living with family", "Other"]} required error={err.homeStatus} />
            <Field label={moneyLabel("Monthly mortgage/rent payment", cur)} name="monthlyMortgageOrRent" value={form.housing.monthlyMortgageOrRent} onChange={handleChange("housing")} required numericOnly error={err.monthlyMortgageOrRent} />
            <Field label="Length of residence" name="lengthOfResidence" value={form.housing.lengthOfResidence} onChange={handleChange("housing")} required error={err.lengthOfResidence} />
          </div>
        );
      case 5:
        return (
          <div className={styles.formGrid}>
            <Field label="Current loans" name="currentLoans" as="textarea" rows={2} value={form.obligations.currentLoans} onChange={handleChange("obligations")} className={styles.formGridFull} />
            <Field label={moneyLabel("Credit card balances", cur)} name="creditCardBalances" value={form.obligations.creditCardBalances} onChange={handleChange("obligations")} required numericOnly error={err.creditCardBalances} />
            <Field label={moneyLabel("Monthly debt repayments", cur)} name="monthlyDebtRepayments" value={form.obligations.monthlyDebtRepayments} onChange={handleChange("obligations")} required numericOnly error={err.monthlyDebtRepayments} />
            <Field label="Guarantees / co-signing obligations" name="guarantees" as="textarea" rows={2} value={form.obligations.guarantees} onChange={handleChange("obligations")} className={styles.formGridFull} />
            <Field label={moneyLabel("Alimony or child support obligations", cur)} name="alimonyOrChildSupport" value={form.obligations.alimonyOrChildSupport} onChange={handleChange("obligations")} numericOnly className={styles.formGridFull} />
          </div>
        );
      case 6:
        return (
          <div className={styles.formGrid}>
            <Field label={moneyLabel("Bank account balances", cur)} name="bankAccountBalances" value={form.assets.bankAccountBalances} onChange={handleChange("assets")} required numericOnly error={err.bankAccountBalances} />
            <Field label={moneyLabel("Investments", cur)} name="investments" value={form.assets.investments} onChange={handleChange("assets")} numericOnly />
            <Field label="Real estate owned" name="realEstateOwned" value={form.assets.realEstateOwned} onChange={handleChange("assets")} />
            <Field label="Other significant assets" name="otherAssets" value={form.assets.otherAssets} onChange={handleChange("assets")} />
          </div>
        );
      case 7:
        return (
          <div className={styles.formGrid}>
            <Field label={moneyLabel("Loan amount requested", cur)} name="amount" value={form.loanRequest.amount} onChange={handleChange("loanRequest")} required numericOnly error={err.amount} />
            <Field label="Desired loan term" name="term" value={form.loanRequest.term} onChange={handleChange("loanRequest")} required error={err.term} />
            <Field label="Preferred repayment frequency" name="repaymentFrequency" value={form.loanRequest.repaymentFrequency} onChange={handleChange("loanRequest")} options={["Weekly", "Bi-weekly", "Monthly"]} required error={err.repaymentFrequency} />
            <Field label="Purpose of loan" name="purpose" as="textarea" rows={3} value={form.loanRequest.purpose} onChange={handleChange("loanRequest")} required className={styles.formGridFull} error={err.purpose} />
          </div>
        );
      case 8:
        return (
          <div className={styles.formGrid}>
            <Field label="IBAN" name="iban" value={form.banking.iban} onChange={handleChange("banking")} required className={styles.formGridFull} error={err.iban} />
            <Field label="Bank name" name="bankName" value={form.banking.bankName} onChange={handleChange("banking")} required error={err.bankName} />
            <Field label="Account holder name" name="accountHolderName" value={form.banking.accountHolderName} onChange={handleChange("banking")} required error={err.accountHolderName} />
          </div>
        );
      case 9:
        return (
          <>
            <h3 className={styles.sectionHeading}>Affordability Assessment</h3>
            <div className={styles.formGrid}>
              <Field label={moneyLabel("Average monthly net income", cur)} name="averageMonthlyNetIncome" value={form.affordability.averageMonthlyNetIncome} onChange={handleChange("affordability")} required numericOnly error={err.averageMonthlyNetIncome} />
              <Field label={moneyLabel("Total monthly living expenses", cur)} name="totalMonthlyLivingExpenses" value={form.affordability.totalMonthlyLivingExpenses} onChange={handleChange("affordability")} required numericOnly error={err.totalMonthlyLivingExpenses} />
              <Field label={moneyLabel("Current monthly debt repayments", cur)} name="currentMonthlyDebtRepayments" value={form.affordability.currentMonthlyDebtRepayments} onChange={handleChange("affordability")} required numericOnly error={err.currentMonthlyDebtRepayments} />
              <Field label="Missed loan repayments in last 24 months?" name="missedRepaymentsLast24Months" value={form.affordability.missedRepaymentsLast24Months} onChange={handleChange("affordability")} options={["No", "Yes"]} required error={err.missedRepaymentsLast24Months} />
              <Field label="Insolvency or bankruptcy proceedings?" name="insolvencyProceedings" value={form.affordability.insolvencyProceedings} onChange={handleChange("affordability")} options={["No", "Yes"]} required error={err.insolvencyProceedings} />
            </div>
            <h3 className={styles.sectionHeading}>Declarations & Consents</h3>
            <div className={styles.checkboxList}>
              {[
                ["informationAccurate", "I confirm that all information provided is accurate and complete."],
                ["creditAssessmentConsent", "I consent to a credit assessment."],
                ["identityVerificationConsent", "I consent to identity verification."],
                ["privacyNoticeAcknowledged", "I acknowledge the privacy notice."],
                ["electronicCommunicationConsent", "I consent to electronic communication regarding this application."],
              ].map(([key, label]) => (
                <label
                  key={key}
                  className={`${styles.checkboxItem}${err[key] ? ` ${styles.checkboxItemError}` : ""}`}
                >
                  <input
                    type="checkbox"
                    name={key}
                    checked={form.declarations[key]}
                    onChange={handleChange("declarations")}
                  />
                  <span className={styles.checkboxText}>
                    {label}
                    {err[key] ? <span className={styles.checkboxErrorText}> — {err[key]}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          </>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.spinner} aria-label="Loading" />
      </div>
    );
  }

  const isLocked = ["submitted", "under_review", "approved", "rejected"].includes(applicationStatus);
  const progress = ((step + 1) / STEPS.length) * 100;

  const renderStepNav = (variant = "horizontal") =>
    STEPS.map((s, i) => {
      const isDone = i < step;
      const isActive = i === step;
      const isUpcoming = i > step;
      const isVertical = variant === "vertical";

      return (
        <button
          key={s.key}
          type="button"
          className={
            isVertical
              ? `${styles.sidebarStep} ${isActive ? styles.sidebarStepActive : ""} ${
                  isDone ? styles.sidebarStepDone : ""
                } ${isUpcoming ? styles.sidebarStepUpcoming : ""}`
              : `${styles.stepPill} ${isActive ? styles.stepPillActive : ""} ${
                  isDone ? styles.stepPillDone : ""
                } ${isUpcoming ? styles.stepPillUpcoming : ""}`
          }
          onClick={() => goToStep(i)}
          disabled={i > step}
          title={s.desc}
        >
          <span className={isVertical ? styles.sidebarStepIndex : styles.stepPillIndex}>
            {isDone ? "✓" : i + 1}
          </span>
          <span className={isVertical ? styles.sidebarStepText : styles.stepPillLabel}>
            <span className={isVertical ? styles.sidebarStepTitle : undefined}>{s.title}</span>
            {isVertical && isActive ? (
              <span className={styles.sidebarStepDesc}>{s.desc}</span>
            ) : null}
          </span>
        </button>
      );
    });

  const progressRing = (
    <div className={styles.progressRing} aria-hidden="true">
      <svg viewBox="0 0 88 88" className={styles.progressRingSvg}>
        <circle className={styles.progressRingTrack} cx="44" cy="44" r="38" />
        <circle
          className={styles.progressRingFill}
          cx="44"
          cy="44"
          r="38"
          style={{ strokeDashoffset: `${239 - (239 * progress) / 100}` }}
        />
      </svg>
      <span className={styles.progressRingValue}>{Math.round(progress)}%</span>
    </div>
  );

  if (isLocked) {
    return (
      <LoanStatusView
        status={applicationStatus}
        form={form}
        meta={applicationMeta}
        onStartNew={startNewApplication}
      />
    );
  }

  return (
    <div className={styles.wrapper}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderMain}>
          <p className={styles.pageEyebrow}>Loan application</p>
          <h1 className={styles.title}>Apply for a Loan</h1>
          <p className={styles.subtitle}>Complete each section below — your progress saves automatically.</p>
        </div>
        <span className={`${styles.saveHint} ${lastSavedAt ? styles.saveHintActive : ""}`}>
          {isSaving ? "Saving…" : lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString()}` : "Auto-save on"}
        </span>
      </header>

      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Application steps">
          <div className={styles.sidebarCard}>
            <div className={styles.sidebarProgressHead}>
              {progressRing}
              <div>
                <p className={styles.sidebarProgressLabel}>Overall progress</p>
                <p className={styles.sidebarProgressValue}>{Math.round(progress)}% complete</p>
                <p className={styles.sidebarProgressStep}>
                  Step {step + 1} of {STEPS.length}
                </p>
              </div>
            </div>
            <nav className={styles.sidebarSteps}>{renderStepNav("vertical")}</nav>
          </div>
        </aside>

        <div className={styles.formShell}>
          <section className={styles.progressPanelMobile} aria-label="Application progress">
            <div className={styles.progressOverview}>
              <div className={styles.progressOverviewText}>
                <span className={styles.stepBadge}>
                  Step {step + 1} of {STEPS.length}
                </span>
                <h2 className={styles.currentStepName}>{STEPS[step].title}</h2>
                <p className={styles.currentStepDesc}>{STEPS[step].desc}</p>
              </div>
              {progressRing}
            </div>

            <div className={styles.progressTrack} aria-hidden="true">
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            </div>

            <div className={styles.stepList}>{renderStepNav("horizontal")}</div>
          </section>

          <div className={styles.formShellHead}>
            <span className={styles.stepBadge}>Step {step + 1} of {STEPS.length}</span>
            <h2 className={styles.currentStepName}>{STEPS[step].title}</h2>
            <p className={styles.currentStepDesc}>{STEPS[step].desc}</p>
          </div>

          <main className={styles.main}>{renderStep()}</main>

          <footer className={styles.actionsBar}>
            <div className={styles.footerGroup}>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                Previous
              </button>
              {step < STEPS.length - 1 && (
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={goNext}>
                  Continue
                </button>
              )}
            </div>
            <div className={styles.footerGroup}>
              <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} disabled={isSaving} onClick={() => saveDraft(false)}>
                Save Progress
              </button>
              {step === STEPS.length - 1 && (
                <button type="button" className={`${styles.btn} ${styles.btnSuccess}`} disabled={isSaving} onClick={handleSubmit}>
                  Submit Application
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default ApplyLoanSec;
