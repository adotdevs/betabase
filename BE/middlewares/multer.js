const multer = require("multer");

const storage = multer.memoryStorage();

const MB = 1024 * 1024;

const handleMulterError = (err, req, res, next) => {
  if (!err) {
    return next();
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      const maxMb = err.field || err.limit
        ? Math.round((err.limit || 10 * MB) / MB)
        : 10;
      return res.status(413).json({
        success: false,
        msg: `File too large. Maximum size is ${maxMb}MB per attachment.`,
        error: "FILE_TOO_LARGE",
      });
    }

    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(413).json({
        success: false,
        msg: "Too many files attached. Maximum is 5 attachments per message.",
        error: "TOO_MANY_FILES",
      });
    }

    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        msg: "Unexpected file field in upload.",
        error: err.code,
      });
    }

    return res.status(400).json({
      success: false,
      msg: err.message || "File upload failed.",
      error: err.code,
    });
  }

  return res.status(400).json({
    success: false,
    msg: err.message || "File upload failed.",
  });
};

const wrapUpload = (uploadMiddleware) => (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err) {
      return handleMulterError(err, req, res, next);
    }
    next();
  });
};

/** General uploads (KYC, tokens, etc.) — up to 50MB per file */
const generalUpload = multer({
  storage,
  limits: {
    fileSize: 50 * MB,
    files: 10,
    fieldSize: 10 * MB,
  },
});

/** Ticket attachments — matches FE/cloudinaryTicket limits */
const ticketUploadMulter = multer({
  storage,
  limits: {
    fileSize: 10 * MB,
    files: 5,
    fieldSize: 10 * MB,
  },
});

const singleUpload = wrapUpload(generalUpload.any());
const ticketUpload = wrapUpload(ticketUploadMulter.any());

module.exports = singleUpload;
module.exports.ticketUpload = ticketUpload;
module.exports.handleMulterError = handleMulterError;
