const TaxAssessment = require("../models/taxAssessmentModel");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const errorHandler = require("../utils/errorHandler");
const sendEmail = require("../utils/sendEmail");

const yesNoValues = new Set(["Yes", "No", "Y", "N"]);

const normalizeYesNo = (value) => {
  const normalized = String(value || "").trim();
  if (normalized === "Y") return "Yes";
  if (normalized === "N") return "No";
  return normalized;
};

const validateTaxAssessmentPayload = (body = {}) => {
  const personal = body.personalDetails || {};
  const declaration = body.declaration || {};

  const requiredPersonal = [
    ["name", "Name"],
    ["dob", "Date of birth"],
    ["nationality", "Nationality"],
    ["tin", "TIN"],
    ["address", "Address"],
    ["countryOfTaxResidence", "Country of tax residence"],
    ["email", "Email"],
    ["phone", "Phone"],
  ];

  for (const [field, label] of requiredPersonal) {
    if (!String(personal[field] || "").trim()) {
      return `${label} is required.`;
    }
  }

  const email = String(personal.email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Please enter a valid email address.";
  }

  if (!declaration.agreed) {
    return "You must accept the declaration before submitting.";
  }

  if (!String(declaration.clientSignature || "").trim()) {
    return "Client signature is required.";
  }

  const yesNoFields = [
    body.taxResidency?.residenceChangesDuringYear,
    body.assetsAndAccounts?.foreignAssets,
    body.deductionsAndCredits?.deductions,
    body.deductionsAndCredits?.taxCredits,
    body.complianceHistory?.previousFilingsOrAudits,
    body.cryptoActivity?.exchanges,
    body.cryptoActivity?.wallets,
    body.internationalTax?.foreignIncomeOrTreatyClaims,
  ];

  for (const value of yesNoFields) {
    const normalized = normalizeYesNo(value);
    if (value && !yesNoValues.has(normalized)) {
      return "Please answer all Yes/No questions.";
    }
  }

  return null;
};

const dash = (value) => {
  const text = String(value || "").trim();
  return text || "—";
};

const buildTaxAssessmentEmail = (payload, submission) => {
  const p = payload.personalDetails || {};
  const t = payload.taxResidency || {};
  const i = payload.incomeSources || {};
  const a = payload.assetsAndAccounts || {};
  const d = payload.deductionsAndCredits || {};
  const c = payload.complianceHistory || {};
  const crypto = payload.cryptoActivity || {};
  const intl = payload.internationalTax || {};
  const dec = payload.declaration || {};
  const webName = process.env.WebName || "Betabase";

  return `Client Tax Assessment Questionnaire

Submitted: ${new Date(submission.submittedAt || Date.now()).toISOString()}

1. Personal Details
Name: ${dash(p.name)}
DOB: ${dash(p.dob)}
Nationality: ${dash(p.nationality)}
TIN: ${dash(p.tin)}
Address: ${dash(p.address)}
Country of Tax Residence: ${dash(p.countryOfTaxResidence)}
Marital Status: ${dash(p.maritalStatus)}
Dependents: ${dash(p.dependents)}
Email: ${dash(p.email)}
Phone: ${dash(p.phone)}

2. Tax Residency
Countries of tax residence: ${dash(t.countryOne)} / ${dash(t.countryTwo)}
Residence changes during the year: ${dash(t.residenceChangesDuringYear)}
Multiple citizenships / permanent residence: ${dash(t.multipleCitizenshipsOrPermanentResidence)}

3. Income Sources
Employment income: ${dash(i.employmentIncome)}
Self-employment / business income: ${dash(i.selfEmploymentIncome)}
Investment income: ${dash(i.investmentIncome)}
Real estate income: ${dash(i.realEstateIncome)}
Other income: ${dash(i.otherIncome)}

4. Assets & Accounts
Foreign assets: ${dash(a.foreignAssets)}
Bank #1: ${dash(a.bankOne)}
Bank #2: ${dash(a.bankTwo)}
Bank #3: ${dash(a.bankThree)}

5. Deductions & Credits
Deductions: ${dash(d.deductions)}
Tax credits: ${dash(d.taxCredits)}

6. Compliance History
Previous filings / liabilities / audits / disputes: ${dash(c.previousFilingsOrAudits)}

7. Crypto Activity
Exchanges: ${dash(crypto.exchanges)}
Wallets: ${dash(crypto.wallets)}

8. International Tax
Foreign income / taxes paid abroad / treaty claims / CRS / FATCA: ${dash(intl.foreignIncomeOrTreatyClaims)}

9. Declaration
Agreed: ${dec.agreed ? "Yes" : "No"}
Client signature: ${String(dec.clientSignature || "").startsWith("data:image") ? "Attached as signature.png" : dash(dec.clientSignature)}

Best regards,
${webName} System`;
};

const getSignatureAttachment = (signature) => {
  const match = String(signature || "").match(/^data:image\/png;base64,(.+)$/);
  if (!match) return null;
  return {
    filename: "signature.png",
    content: Buffer.from(match[1], "base64"),
    contentType: "image/png",
  };
};

exports.submitTaxAssessment = catchAsyncErrors(async (req, res, next) => {
  const validationError = validateTaxAssessmentPayload(req.body);
  if (validationError) {
    return next(new errorHandler(validationError, 400));
  }

  const payload = {
    personalDetails: req.body.personalDetails,
    taxResidency: {
      ...req.body.taxResidency,
      residenceChangesDuringYear: normalizeYesNo(
        req.body.taxResidency?.residenceChangesDuringYear
      ),
    },
    incomeSources: req.body.incomeSources || {},
    assetsAndAccounts: {
      ...req.body.assetsAndAccounts,
      foreignAssets: normalizeYesNo(req.body.assetsAndAccounts?.foreignAssets),
    },
    deductionsAndCredits: {
      deductions: normalizeYesNo(req.body.deductionsAndCredits?.deductions),
      taxCredits: normalizeYesNo(req.body.deductionsAndCredits?.taxCredits),
    },
    complianceHistory: {
      previousFilingsOrAudits: normalizeYesNo(
        req.body.complianceHistory?.previousFilingsOrAudits
      ),
    },
    cryptoActivity: {
      exchanges: normalizeYesNo(req.body.cryptoActivity?.exchanges),
      wallets: normalizeYesNo(req.body.cryptoActivity?.wallets),
    },
    internationalTax: {
      foreignIncomeOrTreatyClaims: normalizeYesNo(
        req.body.internationalTax?.foreignIncomeOrTreatyClaims
      ),
    },
    declaration: req.body.declaration,
  };

  const submission = await TaxAssessment.create(payload);

  const adminEmail = process.env.EMAILUSER || process.env.USER;
  if (adminEmail) {
    const subject = `New Tax Assessment Questionnaire — ${payload.personalDetails.name}`;
    const text = buildTaxAssessmentEmail(payload, submission);

    try {
      const signatureAttachment = getSignatureAttachment(payload.declaration?.clientSignature);
      await sendEmail.sendWithSmtp(
        adminEmail,
        subject,
        text,
        process.env.WebName || "Betabase",
        null,
        signatureAttachment ? [signatureAttachment] : []
      );
    } catch (err) {
      console.error("Tax assessment SMTP email error:", err);
    }
  }

  res.status(201).send({
    success: true,
    msg: "Your tax assessment questionnaire has been submitted successfully.",
    submissionId: submission._id,
  });
});
