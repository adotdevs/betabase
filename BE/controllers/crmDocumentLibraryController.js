const cloudinary = require('cloudinary').v2;
const catchAsyncErrors = require('../middlewares/catchAsyncErrors');
const ErrorHandler = require('../utils/errorHandler');
const getCrmDocumentModel = require('../crmDB/models/crmDocumentModel');
const {
  isCloudinaryPdfUrl,
  fetchCloudinaryPdfBuffer,
  buildPdfPageImageUrl,
} = require('../utils/cloudinaryKyc');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

const DEFAULT_CATEGORIES = [
  'General',
  'Templates',
  'Policies',
  'Marketing',
  'Training',
  'Scripts',
];

const sanitizeFileName = (name) =>
  (name || 'document')
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);

const detectFileType = (file) => {
  const mime = (file.mimetype || '').toLowerCase();
  const name = (file.originalname || '').toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    return 'pdf';
  }
  return 'image';
};

const uploadToCloudinary = (file) =>
  new Promise((resolve, reject) => {
    const sanitizedName = sanitizeFileName(file.originalname);
    cloudinary.uploader
      .upload_stream(
        {
          public_id: `crm-library/${Date.now()}_${sanitizedName}`,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      )
      .end(file.buffer);
  });

const canManageDocuments = (user) =>
  user?.role === 'superadmin' || user?.role === 'admin';

const formatDocument = (doc) => {
  const previewUrl =
    doc.fileType === 'pdf'
      ? buildPdfPageImageUrl(doc.fileUrl, 1, 480) || doc.fileUrl
      : doc.fileUrl;

  return {
    ...doc,
    previewUrl,
  };
};

exports.getDocumentCategories = catchAsyncErrors(async (req, res) => {
  const CrmDocument = await getCrmDocumentModel();
  const customCategories = await CrmDocument.distinct('category', { isDeleted: false });
  const categories = [...new Set([...DEFAULT_CATEGORIES, ...customCategories.filter(Boolean)])].sort(
    (a, b) => a.localeCompare(b)
  );

  res.status(200).json({
    success: true,
    categories,
  });
});

exports.listDocuments = catchAsyncErrors(async (req, res) => {
  const CrmDocument = await getCrmDocumentModel();
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 24, 1), 100);
  const skip = (page - 1) * limit;

  const query = { isDeleted: false };

  if (req.query.category) {
    query.category = req.query.category;
  }

  if (req.query.fileType === 'pdf' || req.query.fileType === 'image') {
    query.fileType = req.query.fileType;
  }

  const search = (req.query.search || '').trim();
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { category: { $regex: search, $options: 'i' } },
      { originalFileName: { $regex: search, $options: 'i' } },
    ];
  }

  const [documents, total, pdfTotal, imageTotal] = await Promise.all([
    CrmDocument.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    CrmDocument.countDocuments(query),
    CrmDocument.countDocuments({ ...query, fileType: 'pdf' }),
    CrmDocument.countDocuments({ ...query, fileType: 'image' }),
  ]);

  res.status(200).json({
    success: true,
    documents: documents.map(formatDocument),
    stats: {
      total,
      pdfTotal,
      imageTotal,
    },
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.uploadDocument = catchAsyncErrors(async (req, res, next) => {
  if (!canManageDocuments(req.user)) {
    return next(new ErrorHandler('Only admins can upload documents', 403));
  }

  const file = req.file;
  if (!file) {
    return next(new ErrorHandler('No file uploaded', 400));
  }

  if (
    !ALLOWED_MIME_TYPES.has(file.mimetype) &&
    !file.originalname?.toLowerCase().endsWith('.pdf')
  ) {
    return next(new ErrorHandler('Only PDF and image files are allowed', 400));
  }

  const title = (req.body.title || file.originalname || 'Untitled document').trim();
  if (!title) {
    return next(new ErrorHandler('Document title is required', 400));
  }

  const description = (req.body.description || '').trim();
  const category = (req.body.category || 'General').trim() || 'General';
  const fileType = detectFileType(file);

  const uploadResult = await uploadToCloudinary(file);

  const CrmDocument = await getCrmDocumentModel();
  const uploadedByName =
    `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;

  const document = await CrmDocument.create({
    title,
    description,
    category,
    fileUrl: uploadResult.secure_url,
    fileType,
    mimeType: file.mimetype,
    originalFileName: file.originalname,
    fileSize: file.size,
    cloudinaryPublicId: uploadResult.public_id,
    cloudinaryResourceType: uploadResult.resource_type || 'image',
    uploadedBy: req.user._id,
    uploadedByName,
  });

  res.status(201).json({
    success: true,
    msg: 'Document uploaded successfully',
    document: formatDocument(document.toObject()),
  });
});

exports.updateDocument = catchAsyncErrors(async (req, res, next) => {
  if (!canManageDocuments(req.user)) {
    return next(new ErrorHandler('Only admins can update documents', 403));
  }

  const CrmDocument = await getCrmDocumentModel();
  const document = await CrmDocument.findOne({ _id: req.params.id, isDeleted: false });

  if (!document) {
    return next(new ErrorHandler('Document not found', 404));
  }

  if (req.body.title !== undefined) {
    const title = String(req.body.title).trim();
    if (!title) {
      return next(new ErrorHandler('Document title cannot be empty', 400));
    }
    document.title = title;
  }

  if (req.body.description !== undefined) {
    document.description = String(req.body.description).trim();
  }

  if (req.body.category !== undefined) {
    document.category = String(req.body.category).trim() || 'General';
  }

  await document.save();

  res.status(200).json({
    success: true,
    msg: 'Document updated successfully',
    document: formatDocument(document.toObject()),
  });
});

exports.deleteDocument = catchAsyncErrors(async (req, res, next) => {
  if (!canManageDocuments(req.user)) {
    return next(new ErrorHandler('Only admins can delete documents', 403));
  }

  const CrmDocument = await getCrmDocumentModel();
  const document = await CrmDocument.findOne({ _id: req.params.id, isDeleted: false });

  if (!document) {
    return next(new ErrorHandler('Document not found', 404));
  }

  document.isDeleted = true;
  await document.save();

  if (document.cloudinaryPublicId) {
    try {
      await cloudinary.uploader.destroy(document.cloudinaryPublicId, {
        resource_type: document.cloudinaryResourceType || 'image',
      });
    } catch (error) {
      // Soft delete succeeded even if Cloudinary cleanup fails.
    }
  }

  res.status(200).json({
    success: true,
    msg: 'Document deleted successfully',
  });
});

exports.downloadDocument = catchAsyncErrors(async (req, res, next) => {
  const CrmDocument = await getCrmDocumentModel();
  const document = await CrmDocument.findOne({ _id: req.params.id, isDeleted: false }).lean();

  if (!document) {
    return next(new ErrorHandler('Document not found', 404));
  }

  const safeBaseName = sanitizeFileName(document.title || document.originalFileName);

  if (document.fileType === 'pdf' || isCloudinaryPdfUrl(document.fileUrl)) {
    const pdfDocument = await fetchCloudinaryPdfBuffer(document.fileUrl);
    if (pdfDocument?.buffer) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeBaseName}.pdf"`);
      return res.send(pdfDocument.buffer);
    }
  }

  try {
    const fileResponse = await fetch(document.fileUrl);
    if (!fileResponse.ok) {
      return next(new ErrorHandler('Failed to download document', 502));
    }

    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    const extMatch = document.fileUrl.match(/\.(png|jpe?g|webp|gif|pdf)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
    const contentType =
      fileResponse.headers.get('content-type') ||
      document.mimeType ||
      (ext === 'pdf' ? 'application/pdf' : 'image/jpeg');

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeBaseName}.${ext === 'pdf' ? 'pdf' : ext}"`
    );
    return res.send(buffer);
  } catch (error) {
    return next(new ErrorHandler('Failed to download document', 502));
  }
});
