import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import Menu from "../Landing/components/Menu";
import Footer from "../Landing/components/Footer";
import { COUNTRIES } from "../../../../constants/countries";
import { submitTaxAssessmentApi } from "../../../../Api/Service";
import SignaturePad from "./SignaturePad";
import styles from "./TaxAssessmentQuestionnaire.module.css";

const INITIAL_FORM = {
  personalDetails: {
    name: "",
    dob: "",
    nationality: "",
    tin: "",
    address: "",
    countryOfTaxResidence: "",
    maritalStatus: "",
    dependents: "",
    email: "",
    phone: "",
  },
  taxResidency: {
    countryOne: "",
    countryTwo: "",
    residenceChangesDuringYear: "",
    multipleCitizenshipsOrPermanentResidence: "",
  },
  incomeSources: {
    employmentIncome: "",
    selfEmploymentIncome: "",
    investmentIncome: "",
    realEstateIncome: "",
    otherIncome: "",
  },
  assetsAndAccounts: {
    foreignAssets: "",
    bankOne: "",
    bankTwo: "",
    bankThree: "",
  },
  deductionsAndCredits: {
    deductions: "",
    taxCredits: "",
  },
  complianceHistory: {
    previousFilingsOrAudits: "",
  },
  cryptoActivity: {
    exchanges: "",
    wallets: "",
  },
  internationalTax: {
    foreignIncomeOrTreatyClaims: "",
  },
  declaration: {
    agreed: false,
    clientSignature: "",
  },
};

const MARITAL_STATUS_OPTIONS = [
  "Single",
  "Married",
  "Married filing jointly",
  "Married filing separately",
  "Divorced",
  "Separated",
  "Widowed",
  "Civil partnership",
  "Prefer not to say",
];

const CountrySelect = ({ id, value, onChange, placeholder = "Select country" }) => (
  <select id={id} className={styles.select} value={value} onChange={onChange}>
    <option value="">{placeholder}</option>
    {COUNTRIES.map((country) => (
      <option key={`${id}-${country}`} value={country}>
        {country}
      </option>
    ))}
  </select>
);

const YesNoField = ({ label, name, section, value, onChange, required = false }) => (
  <div className={styles.field}>
    <span className={styles.groupLabel}>
      {label}
      {required ? <span className={styles.required}> *</span> : null}
    </span>
    <div className={styles.radioGroup}>
      {["Yes", "No"].map((option) => (
        <label key={option} className={styles.radioOption}>
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => onChange(section, name, option)}
          />
          {option}
        </label>
      ))}
    </div>
  </div>
);

const TaxAssessmentQuestionnaire = () => {
  const [searchParams] = useSearchParams();
  const fromDashboard = searchParams.get("from") === "dashboard";
  const backTo = fromDashboard ? "/dashboard" : "/";
  const backLabel = fromDashboard ? "Back to dashboard" : "Back to homepage";
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const setField = (section, name, value) => {
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [name]: value,
      },
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${section}.${name}`];
      return next;
    });
  };

  const validate = () => {
    const nextErrors = {};
    const p = form.personalDetails;

    if (!p.name.trim()) nextErrors["personalDetails.name"] = "Name is required.";
    if (!p.dob.trim()) nextErrors["personalDetails.dob"] = "Date of birth is required.";
    if (!p.nationality.trim()) nextErrors["personalDetails.nationality"] = "Nationality is required.";
    if (!p.tin.trim()) nextErrors["personalDetails.tin"] = "TIN is required.";
    if (!p.address.trim()) nextErrors["personalDetails.address"] = "Address is required.";
    if (!p.countryOfTaxResidence.trim()) {
      nextErrors["personalDetails.countryOfTaxResidence"] = "Country of tax residence is required.";
    }
    if (!p.email.trim()) nextErrors["personalDetails.email"] = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) {
      nextErrors["personalDetails.email"] = "Enter a valid email address.";
    }
    if (!p.phone.trim()) nextErrors["personalDetails.phone"] = "Phone is required.";

    const yesNoRequired = [
      ["taxResidency", "residenceChangesDuringYear", "Please select Yes or No."],
      ["assetsAndAccounts", "foreignAssets", "Please select Yes or No."],
      ["deductionsAndCredits", "deductions", "Please select Yes or No."],
      ["deductionsAndCredits", "taxCredits", "Please select Yes or No."],
      ["complianceHistory", "previousFilingsOrAudits", "Please select Yes or No."],
      ["cryptoActivity", "exchanges", "Please select Yes or No."],
      ["cryptoActivity", "wallets", "Please select Yes or No."],
      ["internationalTax", "foreignIncomeOrTreatyClaims", "Please select Yes or No."],
    ];

    yesNoRequired.forEach(([section, field, message]) => {
      if (!form[section][field]) {
        nextErrors[`${section}.${field}`] = message;
      }
    });

    if (!form.declaration.agreed) {
      nextErrors["declaration.agreed"] = "You must accept the declaration.";
    }
    if (!form.declaration.clientSignature.trim()) {
      nextErrors["declaration.clientSignature"] = "Client signature is required.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) {
      toast.error("Please complete all required fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await submitTaxAssessmentApi(form);
      if (response?.success) {
        setIsSubmitted(true);
        toast.success(response.msg || "Questionnaire submitted.");
      } else {
        toast.error(response?.msg || "Submission failed.");
      }
    } catch (error) {
      toast.error(error?.response?.data?.msg || error?.message || "Submission failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderError = (key) =>
    errors[key] ? <span className={styles.error}>{errors[key]}</span> : null;

  return (
    <div className={styles.page}>
      <Menu hideSectionNav showDashboard={fromDashboard} />
      <div className={styles.container}>
        <div className={styles.hero}>
          <Link to={backTo} className={styles.backLink}>
            ← {backLabel}
          </Link>
          <h1>Client Tax Assessment Questionnaire</h1>
          <p>
            Please complete the fields below. If needed, attach additional pages and
            contact support for document uploads.
          </p>
        </div>

        <div className={styles.card}>
          {isSubmitted ? (
            <div className={styles.successCard}>
              <h2>Thank you</h2>
              <p>Your tax assessment questionnaire has been submitted successfully.</p>
              <p style={{ marginTop: 16 }}>
                <Link to={backTo} className={styles.submitBtn} style={{ display: "inline-block", width: "auto", textDecoration: "none" }}>
                  {fromDashboard ? "Back to dashboard" : "Return to homepage"}
                </Link>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <h2 className={styles.sectionTitle}>1. Personal Details</h2>
              <div className={styles.field}>
                <label htmlFor="name">Name <span className={styles.required}>*</span></label>
                <input id="name" value={form.personalDetails.name} onChange={(e) => setField("personalDetails", "name", e.target.value)} placeholder="Full legal name" />
                {renderError("personalDetails.name")}
              </div>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label htmlFor="dob">DOB <span className={styles.required}>*</span></label>
                  <input
                    id="dob"
                    type="date"
                    className={styles.dateInput}
                    value={form.personalDetails.dob}
                    onChange={(e) => setField("personalDetails", "dob", e.target.value)}
                  />
                  {renderError("personalDetails.dob")}
                </div>
                <div className={styles.field}>
                  <label htmlFor="nationality">Nationality <span className={styles.required}>*</span></label>
                  <CountrySelect
                    id="nationality"
                    value={form.personalDetails.nationality}
                    onChange={(e) => setField("personalDetails", "nationality", e.target.value)}
                    placeholder="Select nationality"
                  />
                  {renderError("personalDetails.nationality")}
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label htmlFor="tin">TIN <span className={styles.required}>*</span></label>
                  <input id="tin" value={form.personalDetails.tin} onChange={(e) => setField("personalDetails", "tin", e.target.value)} />
                  {renderError("personalDetails.tin")}
                </div>
                <div className={styles.field}>
                  <label htmlFor="maritalStatus">Marital Status</label>
                  <select
                    id="maritalStatus"
                    className={styles.select}
                    value={form.personalDetails.maritalStatus}
                    onChange={(e) => setField("personalDetails", "maritalStatus", e.target.value)}
                  >
                    <option value="">Select marital status</option>
                    {MARITAL_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor="address">Address <span className={styles.required}>*</span></label>
                <textarea id="address" value={form.personalDetails.address} onChange={(e) => setField("personalDetails", "address", e.target.value)} placeholder="Full residential address" />
                {renderError("personalDetails.address")}
              </div>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label htmlFor="countryOfTaxResidence">Country of Tax Residence <span className={styles.required}>*</span></label>
                  <CountrySelect
                    id="countryOfTaxResidence"
                    value={form.personalDetails.countryOfTaxResidence}
                    onChange={(e) => setField("personalDetails", "countryOfTaxResidence", e.target.value)}
                    placeholder="Select country"
                  />
                  {renderError("personalDetails.countryOfTaxResidence")}
                </div>
                <div className={styles.field}>
                  <label htmlFor="dependents">Dependents</label>
                  <input id="dependents" value={form.personalDetails.dependents} onChange={(e) => setField("personalDetails", "dependents", e.target.value)} placeholder="Number of dependents" />
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label htmlFor="email">Email <span className={styles.required}>*</span></label>
                  <input id="email" type="email" value={form.personalDetails.email} onChange={(e) => setField("personalDetails", "email", e.target.value)} placeholder="john@example.com" />
                  {renderError("personalDetails.email")}
                </div>
                <div className={styles.field}>
                  <label htmlFor="phone">Phone <span className={styles.required}>*</span></label>
                  <input id="phone" type="tel" value={form.personalDetails.phone} onChange={(e) => setField("personalDetails", "phone", e.target.value)} placeholder="+1 300 400 5000" />
                  {renderError("personalDetails.phone")}
                </div>
              </div>

              <h2 className={styles.sectionTitle}>2. Tax Residency</h2>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label htmlFor="countryOne">Countries of tax residence (1)</label>
                  <CountrySelect
                    id="countryOne"
                    value={form.taxResidency.countryOne}
                    onChange={(e) => setField("taxResidency", "countryOne", e.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="countryTwo">Countries of tax residence (2)</label>
                  <CountrySelect
                    id="countryTwo"
                    value={form.taxResidency.countryTwo}
                    onChange={(e) => setField("taxResidency", "countryTwo", e.target.value)}
                  />
                </div>
              </div>
              <YesNoField label="Any residence changes during the year?" name="residenceChangesDuringYear" section="taxResidency" value={form.taxResidency.residenceChangesDuringYear} onChange={setField} required />
              {renderError("taxResidency.residenceChangesDuringYear")}
              <div className={styles.field}>
                <label htmlFor="multipleCitizenships">Multiple citizenships / permanent residence</label>
                <textarea id="multipleCitizenships" value={form.taxResidency.multipleCitizenshipsOrPermanentResidence} onChange={(e) => setField("taxResidency", "multipleCitizenshipsOrPermanentResidence", e.target.value)} />
              </div>

              <h2 className={styles.sectionTitle}>3. Income Sources</h2>
              {[
                ["employmentIncome", "Employment income"],
                ["selfEmploymentIncome", "Self-employment / business income"],
                ["investmentIncome", "Investment income"],
                ["realEstateIncome", "Real estate income"],
              ].map(([key, label]) => (
                <div key={key} className={styles.field}>
                  <label htmlFor={key}>{label}</label>
                  <input id={key} value={form.incomeSources[key]} onChange={(e) => setField("incomeSources", key, e.target.value)} placeholder="Amount or description" />
                </div>
              ))}
              <div className={styles.field}>
                <label htmlFor="otherIncome">Other income</label>
                <textarea id="otherIncome" value={form.incomeSources.otherIncome} onChange={(e) => setField("incomeSources", "otherIncome", e.target.value)} />
              </div>

              <h2 className={styles.sectionTitle}>4. Assets &amp; Accounts</h2>
              <YesNoField label="Foreign assets" name="foreignAssets" section="assetsAndAccounts" value={form.assetsAndAccounts.foreignAssets} onChange={setField} required />
              {renderError("assetsAndAccounts.foreignAssets")}
              <p className={styles.hint}>List all bank accounts below.</p>
              {["bankOne", "bankTwo", "bankThree"].map((key, index) => (
                <div key={key} className={styles.field}>
                  <label htmlFor={key}>Bank #{index + 1}</label>
                  <input id={key} value={form.assetsAndAccounts[key]} onChange={(e) => setField("assetsAndAccounts", key, e.target.value)} placeholder="Bank name, account number, country" />
                </div>
              ))}

              <h2 className={styles.sectionTitle}>5. Deductions &amp; Credits</h2>
              <YesNoField label="Deductions" name="deductions" section="deductionsAndCredits" value={form.deductionsAndCredits.deductions} onChange={setField} required />
              {renderError("deductionsAndCredits.deductions")}
              <YesNoField label="Tax credits" name="taxCredits" section="deductionsAndCredits" value={form.deductionsAndCredits.taxCredits} onChange={setField} required />
              {renderError("deductionsAndCredits.taxCredits")}

              <h2 className={styles.sectionTitle}>6. Compliance History</h2>
              <YesNoField label="Previous filings / liabilities / audits / disputes" name="previousFilingsOrAudits" section="complianceHistory" value={form.complianceHistory.previousFilingsOrAudits} onChange={setField} required />
              {renderError("complianceHistory.previousFilingsOrAudits")}

              <h2 className={styles.sectionTitle}>7. Crypto Activity</h2>
              <YesNoField label="Exchanges" name="exchanges" section="cryptoActivity" value={form.cryptoActivity.exchanges} onChange={setField} required />
              {renderError("cryptoActivity.exchanges")}
              <YesNoField label="Wallets" name="wallets" section="cryptoActivity" value={form.cryptoActivity.wallets} onChange={setField} required />
              {renderError("cryptoActivity.wallets")}

              <h2 className={styles.sectionTitle}>8. International Tax</h2>
              <YesNoField label="Foreign income / taxes paid abroad / treaty claims / CRS / FATCA" name="foreignIncomeOrTreatyClaims" section="internationalTax" value={form.internationalTax.foreignIncomeOrTreatyClaims} onChange={setField} required />
              {renderError("internationalTax.foreignIncomeOrTreatyClaims")}

              <h2 className={styles.sectionTitle}>9. Declaration</h2>
              <div className={styles.declaration}>
                <label htmlFor="agree">
                  <input id="agree" type="checkbox" checked={form.declaration.agreed} onChange={(e) => setField("declaration", "agreed", e.target.checked)} />
                  I declare that the information provided is complete and accurate to the best of my knowledge.
                </label>
                {renderError("declaration.agreed")}
              </div>
              <SignaturePad
                value={form.declaration.clientSignature}
                onChange={(value) => setField("declaration", "clientSignature", value)}
                error={renderError("declaration.clientSignature")}
              />

              <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Submit Questionnaire"}
              </button>
            </form>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default TaxAssessmentQuestionnaire;
