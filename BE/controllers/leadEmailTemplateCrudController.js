const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const ErrorHandler = require("../utils/errorHandler");
const LeadEmailTemplate = require("../models/leadEmailTemplateModel");

const stripHtml = (html) =>
  String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

exports.getLeadEmailTemplates = catchAsyncErrors(async (req, res) => {
  const templates = await LeadEmailTemplate.find()
    .sort({ updatedAt: -1 })
    .select("title body createdAt updatedAt")
    .lean();

  res.status(200).json({
    success: true,
    templates,
  });
});

exports.createLeadEmailTemplate = catchAsyncErrors(async (req, res, next) => {
  const title = String(req.body?.title || "").trim();
  const body = String(req.body?.body || "").trim();

  if (!title) {
    return next(new ErrorHandler("Template title is required.", 400));
  }
  if (!body || !stripHtml(body)) {
    return next(new ErrorHandler("Template body is required.", 400));
  }

  const template = await LeadEmailTemplate.create({
    title,
    body,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  res.status(201).json({
    success: true,
    msg: "Template created",
    template,
  });
});

exports.updateLeadEmailTemplate = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const template = await LeadEmailTemplate.findById(id);

  if (!template) {
    return next(new ErrorHandler("Template not found.", 404));
  }

  if (req.body?.title !== undefined) {
    const title = String(req.body.title).trim();
    if (!title) {
      return next(new ErrorHandler("Template title is required.", 400));
    }
    template.title = title;
  }

  if (req.body?.body !== undefined) {
    const body = String(req.body.body).trim();
    if (!body || !stripHtml(body)) {
      return next(new ErrorHandler("Template body is required.", 400));
    }
    template.body = body;
  }

  template.updatedBy = req.user._id;
  await template.save();

  res.status(200).json({
    success: true,
    msg: "Template updated",
    template,
  });
});

exports.deleteLeadEmailTemplate = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const template = await LeadEmailTemplate.findByIdAndDelete(id);

  if (!template) {
    return next(new ErrorHandler("Template not found.", 404));
  }

  res.status(200).json({
    success: true,
    msg: "Template deleted",
  });
});
