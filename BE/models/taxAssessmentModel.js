const mongoose = require("mongoose");

const taxAssessmentSchema = new mongoose.Schema(
  {
    personalDetails: {
      name: String,
      dob: String,
      nationality: String,
      tin: String,
      address: String,
      countryOfTaxResidence: String,
      maritalStatus: String,
      dependents: String,
      email: String,
      phone: String,
    },
    taxResidency: {
      countryOne: String,
      countryTwo: String,
      residenceChangesDuringYear: String,
      multipleCitizenshipsOrPermanentResidence: String,
    },
    incomeSources: {
      employmentIncome: String,
      selfEmploymentIncome: String,
      investmentIncome: String,
      realEstateIncome: String,
      otherIncome: String,
    },
    assetsAndAccounts: {
      foreignAssets: String,
      bankOne: String,
      bankTwo: String,
      bankThree: String,
    },
    deductionsAndCredits: {
      deductions: String,
      taxCredits: String,
    },
    complianceHistory: {
      previousFilingsOrAudits: String,
    },
    cryptoActivity: {
      exchanges: String,
      wallets: String,
    },
    internationalTax: {
      foreignIncomeOrTreatyClaims: String,
    },
    declaration: {
      agreed: Boolean,
      clientSignature: String,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TaxAssessment", taxAssessmentSchema);
