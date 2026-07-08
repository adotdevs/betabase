const mongoose = require("mongoose");
const connectCRMDatabase = require("../../config/crmDatabase");

const leadEmailLogSchema = new mongoose.Schema(
  {
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
    },
    leadEmail: { type: String, trim: true },
    leadFirstName: { type: String, trim: true },
    leadLastName: { type: String, trim: true },
    subject: { type: String, trim: true },
    body: { type: String },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    sentByName: { type: String, trim: true },
    sentByEmail: { type: String, trim: true },
    sentByRole: { type: String, trim: true },
    status: {
      type: String,
      enum: ["sent", "failed"],
      default: "sent",
    },
    failureReason: { type: String },
  },
  { timestamps: true }
);

leadEmailLogSchema.index({ createdAt: -1 });
leadEmailLogSchema.index({ sentByRole: 1, createdAt: -1 });
leadEmailLogSchema.index({ leadId: 1, createdAt: -1 });

const getLeadEmailLogModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.model("LeadEmailLog", leadEmailLogSchema);
};

module.exports = getLeadEmailLogModel;
