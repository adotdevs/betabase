const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const ErrorHandler = require("../utils/errorHandler");
const getLeadEmailLogModel = require("../crmDB/models/leadEmailLogModel");

exports.getLeadEmailHistory = catchAsyncErrors(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const search = String(req.query.search || "").trim();
  const role = String(req.query.role || "").trim();

  const query = {};
  if (role) {
    query.sentByRole = role;
  }
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [
      { leadEmail: regex },
      { leadFirstName: regex },
      { leadLastName: regex },
      { subject: regex },
      { sentByName: regex },
      { sentByEmail: regex },
    ];
  }

  const LeadEmailLog = await getLeadEmailLogModel();
  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    LeadEmailLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    LeadEmailLog.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    logs,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
      total,
      limit,
    },
  });
});

exports.createLeadEmailLogEntry = async ({
  lead,
  subject,
  body,
  user,
  status,
  failureReason,
}) => {
  const LeadEmailLog = await getLeadEmailLogModel();
  const sentByName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();

  return LeadEmailLog.create({
    leadId: lead?._id,
    leadEmail: lead?.email || "",
    leadFirstName: lead?.firstName || "",
    leadLastName: lead?.lastName || "",
    subject,
    body,
    sentBy: user?._id,
    sentByName: sentByName || user?.email || "Unknown",
    sentByEmail: user?.email || "",
    sentByRole: user?.role || "",
    status: status || "sent",
    failureReason: failureReason || undefined,
  });
};

exports.deleteLeadEmailHistory = catchAsyncErrors(async (req, res, next) => {
  const ids = req.body?.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Email history IDs are required.", 400));
  }

  const LeadEmailLog = await getLeadEmailLogModel();
  const result = await LeadEmailLog.deleteMany({ _id: { $in: ids } });

  res.status(200).json({
    success: true,
    msg: `Deleted ${result.deletedCount} email record(s)`,
    deletedCount: result.deletedCount,
  });
});
