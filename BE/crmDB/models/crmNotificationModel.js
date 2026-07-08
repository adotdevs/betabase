const mongoose = require('mongoose');
const connectCRMDatabase = require('../../config/crmDatabase');

const crmNotificationSchema = new mongoose.Schema(
  {
    recipientUserId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    actorName: {
      type: String,
      required: true,
      trim: true,
    },
    actorRole: {
      type: String,
      required: true,
      index: true,
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
      index: true,
    },
    activityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Activity',
      index: true,
    },
    reminderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reminder',
      index: true,
    },
    activityType: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      default: '',
      trim: true,
    },
    leadName: {
      type: String,
      default: '',
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

crmNotificationSchema.index({ recipientUserId: 1, isRead: 1, createdAt: -1 });
crmNotificationSchema.index({ recipientUserId: 1, createdAt: -1 });

const getCrmNotificationModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.models.CrmNotification || crmDB.model('CrmNotification', crmNotificationSchema);
};

module.exports = getCrmNotificationModel;
module.exports.getCrmNotificationModel = getCrmNotificationModel;
