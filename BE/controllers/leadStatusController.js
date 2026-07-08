const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const ErrorHandler = require("../utils/errorHandler");
const getLeadStatusModel = require("../crmDB/models/leadStatusModel");
const getLeadModel = require("../crmDB/models/leadsModel");
const {
  ensureDefaultLeadStatuses,
  getDefaultLeadStatusLabel,
} = require("../utils/leadStatusHelpers");

exports.getLeadStatuses = catchAsyncErrors(async (req, res) => {
  await ensureDefaultLeadStatuses();
  const LeadStatus = await getLeadStatusModel();
  const statuses = await LeadStatus.find().sort({ sortOrder: 1, label: 1 }).lean();

  res.status(200).json({
    success: true,
    statuses,
  });
});

exports.createLeadStatus = catchAsyncErrors(async (req, res, next) => {
  const label = String(req.body?.label || "").trim();
  if (!label) {
    return next(new ErrorHandler("Status label is required.", 400));
  }

  await ensureDefaultLeadStatuses();
  const LeadStatus = await getLeadStatusModel();
  const existing = await LeadStatus.findOne({ label });
  if (existing) {
    return next(new ErrorHandler("This status already exists.", 400));
  }

  const maxOrder = await LeadStatus.findOne().sort({ sortOrder: -1 }).lean();
  const status = await LeadStatus.create({
    label,
    sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    isDefault: false,
  });

  res.status(201).json({
    success: true,
    msg: "Status created",
    status,
  });
});

exports.updateLeadStatus = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const LeadStatus = await getLeadStatusModel();
  const Lead = await getLeadModel();
  const current = await LeadStatus.findById(id);
  if (!current) {
    return next(new ErrorHandler("Status not found.", 404));
  }

  const labelProvided = req.body?.label !== undefined && req.body?.label !== null;
  const label = labelProvided ? String(req.body.label).trim() : current.label;
  if (labelProvided && !label) {
    return next(new ErrorHandler("Status label is required.", 400));
  }

  const duplicate = await LeadStatus.findOne({ label, _id: { $ne: id } });
  if (duplicate) {
    return next(new ErrorHandler("Another status with this name already exists.", 400));
  }

  const oldLabel = current.label;
  if (oldLabel !== label) {
    await Lead.updateMany({ status: oldLabel }, { $set: { status: label } });
    current.label = label;
  }

  if (req.body?.isDefault === true) {
    await LeadStatus.updateMany({}, { $set: { isDefault: false } });
    current.isDefault = true;
  }

  if (typeof req.body?.sortOrder === "number") {
    current.sortOrder = req.body.sortOrder;
  }

  await current.save();

  res.status(200).json({
    success: true,
    msg: "Status updated",
    status: current,
  });
});

exports.deleteLeadStatus = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const LeadStatus = await getLeadStatusModel();
  const Lead = await getLeadModel();

  const status = await LeadStatus.findById(id);
  if (!status) {
    return next(new ErrorHandler("Status not found.", 404));
  }

  const total = await LeadStatus.countDocuments();
  if (total <= 1) {
    return next(new ErrorHandler("At least one status must remain.", 400));
  }

  let fallbackLabel = await getDefaultLeadStatusLabel();
  if (fallbackLabel === status.label) {
    const fallback = await LeadStatus.findOne({ _id: { $ne: id } })
      .sort({ sortOrder: 1, label: 1 })
      .lean();
    fallbackLabel = fallback?.label || "New";
    if (fallback) {
      await LeadStatus.updateMany({}, { $set: { isDefault: false } });
      await LeadStatus.findByIdAndUpdate(fallback._id, { isDefault: true });
    }
  }

  await Lead.updateMany({ status: status.label }, { $set: { status: fallbackLabel } });
  await status.deleteOne();

  res.status(200).json({
    success: true,
    msg: "Status deleted",
    reassignedTo: fallbackLabel,
  });
});
