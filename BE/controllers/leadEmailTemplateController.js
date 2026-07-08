const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const ErrorHandler = require("../utils/errorHandler");
const getLeadModel = require("../crmDB/models/leadsModel");
const sendEmail = require("../utils/sendEmail");
const UserModel = require("../models/userModel");
const { createLeadEmailLogEntry } = require("./leadEmailLogController");

const isPersonalSmtpActive = (smtpConfig) => {
  if (!smtpConfig?.enabled) return false;
  return !!(
    String(smtpConfig.host || "").trim() &&
    String(smtpConfig.user || "").trim() &&
    String(smtpConfig.password || "").trim()
  );
};

const stripHtml = (html) =>
  String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

exports.sendLeadEmail = catchAsyncErrors(async (req, res, next) => {
  const { leadId } = req.params;
  const subject = String(req.body?.subject || "").trim();
  const body = String(req.body?.body || "").trim();
  const emailSender = req.body?.emailSender === "personal" ? "personal" : "default";

  if (!subject) {
    return next(new ErrorHandler("Email subject is required.", 400));
  }
  if (!body || !stripHtml(body)) {
    return next(new ErrorHandler("Email message is required.", 400));
  }

  const Lead = await getLeadModel();
  const lead = await Lead.findById(leadId);

  if (!lead || lead.isDeleted) {
    return next(new ErrorHandler("Lead not found.", 404));
  }

  const recipientEmail = String(lead.email || "").trim();
  if (!recipientEmail || !recipientEmail.includes("@")) {
    return next(new ErrorHandler("Lead does not have a valid email address.", 400));
  }

  const fromName =
    `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() ||
    req.user.email ||
    process.env.WebName;

  let senderLabel = "default system email";

  try {
    if (emailSender === "personal") {
      const senderUser = await UserModel.findById(req.user._id).select("smtpConfig email firstName lastName");

      if (!isPersonalSmtpActive(senderUser?.smtpConfig)) {
        return next(new ErrorHandler("Your personal SMTP credentials are not configured or not active.", 400));
      }

      await sendEmail.sendWithPersonalSmtp(
        recipientEmail,
        subject,
        body,
        fromName,
        senderUser.smtpConfig
      );

      senderLabel = senderUser.smtpConfig.fromEmail || senderUser.smtpConfig.user;
    } else {
      await sendEmail(recipientEmail, subject, body, fromName);
    }

    await createLeadEmailLogEntry({
      lead,
      subject,
      body,
      user: req.user,
      status: "sent",
    });

    res.status(200).json({
      success: true,
      msg: `Email sent to ${recipientEmail} via ${emailSender === "personal" ? "your SMTP" : "default email"}`,
      email: recipientEmail,
      emailSender,
      senderLabel,
    });
  } catch (err) {
    await createLeadEmailLogEntry({
      lead,
      subject,
      body,
      user: req.user,
      status: "failed",
      failureReason: err?.errorMessage || err?.message || "Failed to send email",
    });

    return next(
      new ErrorHandler(err?.errorMessage || err?.message || "Failed to send email", 500)
    );
  }
});
