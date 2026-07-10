const cloudinary = require("cloudinary").v2;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const isPdfFile = (file) =>
  file.mimetype === "application/pdf" ||
  file.originalname?.toLowerCase().endsWith(".pdf");

const isAllowedTicketFile = (file) =>
  ALLOWED_MIME_TYPES.has(file.mimetype) || isPdfFile(file);

const sanitizeFileName = (fileName) =>
  String(fileName || "attachment")
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);

const uploadFileToCloudinary = (file, publicId) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({ public_id: publicId }, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    }).end(file.buffer);
  });

const uploadTicketAttachments = async (files = [], { userId, ticketId }) => {
  const attachmentFiles = (files || []).filter(
    (file) => file.fieldname === "attachments" && file.buffer
  );

  if (attachmentFiles.length > MAX_ATTACHMENTS) {
    const error = new Error(`Maximum ${MAX_ATTACHMENTS} attachments allowed`);
    error.statusCode = 400;
    throw error;
  }

  const uploads = [];

  for (const file of attachmentFiles) {
    if (!isAllowedTicketFile(file)) {
      const error = new Error(
        "Only image files (JPG, PNG, GIF, WEBP) and PDF documents are allowed"
      );
      error.statusCode = 400;
      throw error;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const error = new Error("Each attachment must be 10MB or smaller");
      error.statusCode = 400;
      throw error;
    }

    const sanitizedName = sanitizeFileName(file.originalname);
    const publicId = `tickets/${userId}/${ticketId}/${Date.now()}_${sanitizedName}`;
    const result = await uploadFileToCloudinary(file, publicId);

    uploads.push({
      url: result.secure_url,
      fileName: file.originalname || sanitizedName,
      mimeType: file.mimetype || (isPdfFile(file) ? "application/pdf" : "image/jpeg"),
    });
  }

  return uploads;
};

module.exports = {
  uploadTicketAttachments,
  MAX_ATTACHMENTS,
};
