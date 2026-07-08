const mongoose = require('mongoose');
const connectCRMDatabase = require('../../config/crmDatabase');

const crmDocumentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 1000,
    },
    category: {
      type: String,
      trim: true,
      default: 'General',
      maxlength: 80,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      enum: ['pdf', 'image'],
      required: true,
    },
    mimeType: {
      type: String,
      default: '',
    },
    originalFileName: {
      type: String,
      default: '',
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    cloudinaryPublicId: {
      type: String,
      default: '',
    },
    cloudinaryResourceType: {
      type: String,
      default: 'image',
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    uploadedByName: {
      type: String,
      default: '',
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

crmDocumentSchema.index({ isDeleted: 1, createdAt: -1 });
crmDocumentSchema.index({ title: 'text', description: 'text', category: 'text' });

const getCrmDocumentModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.models.CrmDocument || crmDB.model('CrmDocument', crmDocumentSchema);
};

module.exports = getCrmDocumentModel;
module.exports.getCrmDocumentModel = getCrmDocumentModel;
