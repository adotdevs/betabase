const mongoose = require("mongoose");

const loanApplicationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["draft", "submitted", "under_review", "approved", "rejected"],
      default: "draft",
    },
    personalInfo: {
      fullLegalName: String,
      dateOfBirth: String,
      nationality: String,
      residentialAddress: String,
      phone: String,
      email: String,
      maritalStatus: String,
      numberOfDependents: String,
    },
    identity: {
      idNumber: String,
      countryOfIssuance: String,
      expiryDate: String,
      taxIdentificationNumber: String,
      idDocumentUrl: String,
    },
    employment: {
      employmentStatus: String,
      employerName: String,
      jobTitle: String,
      lengthOfEmployment: String,
      industry: String,
    },
    income: {
      netMonthlyIncome: String,
      otherIncomeSources: String,
      paymentFrequency: String,
      evidenceUrls: [String],
    },
    housing: {
      homeStatus: String,
      monthlyMortgageOrRent: String,
      lengthOfResidence: String,
    },
    obligations: {
      currentLoans: String,
      creditCardBalances: String,
      monthlyDebtRepayments: String,
      guarantees: String,
      alimonyOrChildSupport: String,
    },
    assets: {
      bankAccountBalances: String,
      investments: String,
      realEstateOwned: String,
      otherAssets: String,
    },
    loanRequest: {
      amount: String,
      term: String,
      purpose: String,
      repaymentFrequency: String,
    },
    banking: {
      iban: String,
      bankName: String,
      accountHolderName: String,
    },
    declarations: {
      informationAccurate: { type: Boolean, default: false },
      creditAssessmentConsent: { type: Boolean, default: false },
      identityVerificationConsent: { type: Boolean, default: false },
      privacyNoticeAcknowledged: { type: Boolean, default: false },
      electronicCommunicationConsent: { type: Boolean, default: false },
    },
    affordability: {
      averageMonthlyNetIncome: String,
      totalMonthlyLivingExpenses: String,
      currentMonthlyDebtRepayments: String,
      missedRepaymentsLast24Months: String,
      insolvencyProceedings: String,
    },
    adminNotes: String,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    submittedAt: Date,
    reviewedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("LoanApplication", loanApplicationSchema);
