const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const ErrorHandler = require("../utils/errorHandler");
const TicketEmailTemplate = require("../models/ticketEmailTemplateModel");

exports.getTicketEmailTemplates = catchAsyncErrors(async (req, res) => {
  const templates = await TicketEmailTemplate.find()
    .sort({ updatedAt: -1 })
    .select("title body createdAt updatedAt")
    .lean();

  res.status(200).json({
    success: true,
    templates,
  });
});

exports.createTicketEmailTemplate = catchAsyncErrors(async (req, res, next) => {
  const title = String(req.body?.title || "").trim();
  const body = String(req.body?.body || "").trim();

  if (!title) {
    return next(new ErrorHandler("Template title is required.", 400));
  }
  if (!body) {
    return next(new ErrorHandler("Template body is required.", 400));
  }

  const template = await TicketEmailTemplate.create({
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

exports.updateTicketEmailTemplate = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const template = await TicketEmailTemplate.findById(id);

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
    if (!body) {
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

exports.deleteTicketEmailTemplate = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const template = await TicketEmailTemplate.findByIdAndDelete(id);

  if (!template) {
    return next(new ErrorHandler("Template not found.", 404));
  }

  res.status(200).json({
    success: true,
    msg: "Template deleted",
  });
});
