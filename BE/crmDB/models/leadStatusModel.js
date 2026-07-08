const mongoose = require("mongoose");
const connectCRMDatabase = require("../../config/crmDatabase");

const leadStatusSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, unique: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const getLeadStatusModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.model("LeadStatus", leadStatusSchema);
};

module.exports = getLeadStatusModel;
module.exports.getLeadStatusModel = getLeadStatusModel;
