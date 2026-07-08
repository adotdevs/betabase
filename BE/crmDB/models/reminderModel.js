const mongoose = require('mongoose');
const connectCRMDatabase = require('../../config/crmDatabase');

const reminderSchema = new mongoose.Schema(
  {
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
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
      index: true,
    },
    notifyBeforeMinutes: {
      type: Number,
      default: 10,
      min: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'dismissed'],
      default: 'pending',
      index: true,
    },
    isNotified: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

reminderSchema.index({ userId: 1, status: 1, reminderDateTime: 1 });
reminderSchema.index({ status: 1, isNotified: 1, reminderDateTime: 1 });

const getReminderModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.models.Reminder || crmDB.model('Reminder', reminderSchema);
};

module.exports = getReminderModel;
module.exports.getReminderModel = getReminderModel;
