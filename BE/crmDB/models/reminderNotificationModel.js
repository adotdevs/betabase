const mongoose = require('mongoose');
const connectCRMDatabase = require('../../config/crmDatabase');

const reminderNotificationSchema = new mongoose.Schema(
  {
    reminderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reminder',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    reminderDateTime: {
      type: Date,
      required: true,
    },
    notifyBeforeMinutes: {
      type: Number,
      default: 10,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    isDismissed: {
      type: Boolean,
      default: false,
      index: true,
    },
    notifiedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

reminderNotificationSchema.index({ userId: 1, isDismissed: 1, createdAt: -1 });

const getReminderNotificationModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.models.ReminderNotification || crmDB.model('ReminderNotification', reminderNotificationSchema);
};

module.exports = getReminderNotificationModel;
module.exports.getReminderNotificationModel = getReminderNotificationModel;
