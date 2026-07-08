const LoanApplication = require("../models/loanApplicationModel");
const UserModel = require("../models/userModel");
const notificationSchema = require("../models/notifications");
const errorHandler = require("../utils/errorHandler");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const cloudinary = require("cloudinary").v2;
const {
  isCloudinaryPdfUrl,
  fetchCloudinaryPdfBuffer,
} = require("../utils/cloudinaryKyc");

const LOAN_SECTIONS = [
  "personalInfo",
  "identity",
  "employment",
  "income",
  "housing",
  "obligations",
  "assets",
  "loanRequest",
  "banking",
  "declarations",
  "affordability",
];

const ACTIVE_STATUSES = ["submitted", "under_review"];

const assertUserAccess = async (req, userId) => {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new errorHandler("User not found", 404);
  }

  if (req.user.role === "subadmin") {
    const hasAccess =
      user.isShared === true ||
      user.assignedSubAdmin?.toString() === req.user._id.toString();
    if (user.role !== "user" || !hasAccess) {
      throw new errorHandler("Access denied", 403);
    }
  }

  return user;
};

const mergeSections = (existing, payload) => {
  const merged = existing.toObject ? { ...existing.toObject() } : { ...existing };
  LOAN_SECTIONS.forEach((section) => {
    if (payload[section]) {
      merged[section] = { ...(merged[section] || {}), ...payload[section] };
    }
  });
  return merged;
};

exports.getMyLoanApplication = catchAsyncErrors(async (req, res) => {
  const application = await LoanApplication.findOne({ userId: req.user._id }).sort({
    updatedAt: -1,
  });

  res.status(200).json({
    success: true,
    application: application || null,
  });
});

exports.saveMyLoanApplication = catchAsyncErrors(async (req, res, next) => {
  const payload = req.body || {};
  let application = await LoanApplication.findOne({ userId: req.user._id }).sort({
    updatedAt: -1,
  });

  if (application && ACTIVE_STATUSES.includes(application.status)) {
    return next(new errorHandler("You already have a pending loan application.", 400));
  }

  if (!application || ["approved", "rejected"].includes(application.status)) {
    application = new LoanApplication({ userId: req.user._id, status: "draft" });
  }

  const merged = mergeSections(application, payload);
  LOAN_SECTIONS.forEach((section) => {
    application[section] = merged[section];
  });

  if (application.status === "draft") {
    application.status = "draft";
  }

  await application.save();

  res.status(200).json({
    success: true,
    msg: "Application saved",
    application,
  });
});

exports.submitMyLoanApplication = catchAsyncErrors(async (req, res, next) => {
  const payload = req.body || {};
  let application = await LoanApplication.findOne({ userId: req.user._id }).sort({
    updatedAt: -1,
  });

  if (application && ACTIVE_STATUSES.includes(application.status)) {
    return next(new errorHandler("You already have a pending loan application.", 400));
  }

  if (!application) {
    application = new LoanApplication({ userId: req.user._id });
  }

  const merged = mergeSections(application, payload);
  LOAN_SECTIONS.forEach((section) => {
    application[section] = merged[section];
  });

  application.status = "submitted";
  application.submittedAt = new Date();
  await application.save();

  const user = await UserModel.findById(req.user._id);

  await notificationSchema.create({
    userId: user._id,
    type: "loan_request",
    content: `New loan application from ${user.firstName} ${user.lastName} for ${application.loanRequest?.amount || "N/A"}.`,
    status: "submitted",
    relatedId: application._id,
    userEmail: user.email,
    userName: `${user.firstName} ${user.lastName}`,
  });

  res.status(200).json({
    success: true,
    msg: "Loan application submitted successfully",
    application,
  });
});

exports.uploadLoanDocument = catchAsyncErrors(async (req, res, next) => {
  const file = req.files?.[0] || req.file;
  if (!file) {
    return next(new errorHandler("No file uploaded", 400));
  }

  const allowed = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
  ]);
  if (!allowed.has(file.mimetype) && !file.originalname?.toLowerCase().endsWith(".pdf")) {
    return next(new errorHandler("Only images and PDF files are allowed", 400));
  }

  const sanitizedName = (file.originalname || "document")
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);

  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { public_id: `loan/${req.user._id}/${Date.now()}_${sanitizedName}` },
      (error, uploadResult) => {
        if (error) reject(error);
        else resolve(uploadResult);
      }
    ).end(file.buffer);
  });

  res.status(200).json({
    success: true,
    url: result.secure_url,
  });
});

const resolveLoanDocumentUrl = (application, docSlot) => {
  if (docSlot === "identity") {
    return application.identity?.idDocumentUrl || null;
  }

  const evidenceMatch = docSlot.match(/^evidence-(\d+)$/);
  if (evidenceMatch) {
    const index = parseInt(evidenceMatch[1], 10);
    return application.income?.evidenceUrls?.[index] || null;
  }

  return null;
};

exports.viewLoanDocument = catchAsyncErrors(async (req, res, next) => {
  const { userId, docSlot } = req.params;

  if (!docSlot || !/^(identity|evidence-\d+)$/.test(docSlot)) {
    return next(new errorHandler("Invalid document slot", 400));
  }

  await assertUserAccess(req, userId);

  const application = await LoanApplication.findOne({ userId }).sort({ updatedAt: -1 });
  if (!application) {
    return next(new errorHandler("No loan application found", 404));
  }

  const docUrl = resolveLoanDocumentUrl(application, docSlot);
  if (!docUrl) {
    return next(new errorHandler("Document not found", 404));
  }

  const safeName = docSlot.startsWith("evidence")
    ? `income-evidence-${docSlot.split("-")[1]}`
    : "identity-document";

  if (!isCloudinaryPdfUrl(docUrl)) {
    try {
      const imageResponse = await fetch(docUrl);
      if (!imageResponse.ok) {
        return next(new errorHandler("Failed to load document", 502));
      }
      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      const extMatch = docUrl.match(/\.(png|jpe?g|webp)$/i);
      const ext = extMatch ? extMatch[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
      res.setHeader(
        "Content-Type",
        imageResponse.headers.get("content-type") || "image/jpeg"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.${ext}"`);
      res.setHeader("Cache-Control", "private, max-age=3600");
      return res.send(buffer);
    } catch (error) {
      return next(new errorHandler("Failed to load document", 502));
    }
  }

  const pdfDocument = await fetchCloudinaryPdfBuffer(docUrl);
  if (!pdfDocument) {
    return next(
      new errorHandler(
        "Failed to load PDF. Enable PDF delivery in Cloudinary Settings → Security.",
        502
      )
    );
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(pdfDocument.buffer);
});

exports.getLoanApplicationByUser = catchAsyncErrors(async (req, res, next) => {
  const { userId } = req.params;
  await assertUserAccess(req, userId);

  const application = await LoanApplication.findOne({ userId }).sort({ updatedAt: -1 });

  if (!application) {
    return next(new errorHandler("No loan application found", 404));
  }

  res.status(200).json({
    success: true,
    application,
  });
});

exports.getAllLoanApplications = catchAsyncErrors(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const query = {};

  if (status) {
    query.status = status;
  } else {
    query.status = { $ne: "draft" };
  }

  if (req.user.role === "subadmin") {
    const assignedUsers = await UserModel.find({
      role: "user",
      $or: [
        { isShared: true },
        { assignedSubAdmin: req.user._id },
      ],
    }).select("_id");
    query.userId = { $in: assignedUsers.map((u) => u._id) };
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [applications, total] = await Promise.all([
    LoanApplication.find(query)
      .populate({ path: "userId", model: UserModel, select: "firstName lastName email" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    LoanApplication.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    applications,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)) || 1,
    },
  });
});

exports.updateLoanApplicationStatus = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { status, adminNotes } = req.body;

  if (!["submitted", "under_review", "approved", "rejected"].includes(status)) {
    return next(new errorHandler("Invalid status", 400));
  }

  const application = await LoanApplication.findById(id);
  if (!application) {
    return next(new errorHandler("Application not found", 404));
  }

  await assertUserAccess(req, application.userId);

  application.status = status;
  application.adminNotes = adminNotes || application.adminNotes;
  application.reviewedBy = req.user._id;
  application.reviewedAt = new Date();
  await application.save();

  res.status(200).json({
    success: true,
    msg: `Application ${status}`,
    application,
  });
});

exports.deleteLoanApplication = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const application = await LoanApplication.findById(id);
  if (!application) {
    return next(new errorHandler("Application not found", 404));
  }

  await assertUserAccess(req, application.userId);
  await LoanApplication.findByIdAndDelete(id);

  res.status(200).json({
    success: true,
    msg: "Loan application deleted",
  });
});
