const catchAsyncErrors = require('../middlewares/catchAsyncErrors');
const ErrorHandler = require('../utils/errorHandler');
const getReminderModel = require('../crmDB/models/reminderModel');
const getReminderNotificationModel = require('../crmDB/models/reminderNotificationModel');
const getLeadModel = require('../crmDB/models/leadsModel');
const User = require('../models/userModel');
const { getCachedUserPermissions, getCachedSubadmins } = require('./crmController');
const { createNotificationsForReminder } = require('../utils/crmNotificationService');
const {
  parseReminderDateTimeInUk,
  getUkDayBounds,
} = require('../utils/reminderTimezone');

const canUserAccessLead = async (lead, user) => {
  if (!lead || lead.isDeleted) return false;
  if (user.role === 'superadmin') return true;

  if (user.role === 'subadmin') {
    return lead.agent && lead.agent.toString() === user._id.toString();
  }

  if (user.role === 'admin') {
    const userPerms = await getCachedUserPermissions(user._id);
    if (userPerms?.adminPermissions?.canManageCrmLeads) {
      const subadminIds = await getCachedSubadmins();
      const allowedAgents = [user._id.toString(), ...subadminIds.map((id) => id.toString())];
      return !lead.agent || allowedAgents.includes(lead.agent.toString());
    }
    return lead.agent && lead.agent.toString() === user._id.toString();
  }

  return false;
};

const buildReminderScopeQuery = (user) => {
  if (user.role === 'superadmin') return {};
  return { userId: user._id };
};

const canUserAccessReminder = (reminder, user) => {
  if (user.role === 'superadmin') return true;
  return reminder.userId.toString() === user._id.toString();
};

const formatReminderList = async (reminders) => {
  if (!reminders.length) return [];

  const Lead = await getLeadModel();
  const leadIds = [...new Set(reminders.map((r) => r.leadId.toString()))];
  const leads = await Lead.find({ _id: { $in: leadIds } }).select('firstName lastName email').lean();
  const leadMap = leads.reduce((acc, lead) => {
    acc[lead._id.toString()] = lead;
    return acc;
  }, {});

  const userIds = [...new Set(reminders.map((r) => r.userId.toString()))];
  const deletedByIds = [
    ...new Set(
      reminders
        .filter((r) => r.deletedBy)
        .map((r) => r.deletedBy.toString())
    ),
  ];
  const allUserIds = [...new Set([...userIds, ...deletedByIds])];
  const users = await User.find({ _id: { $in: allUserIds } })
    .select('firstName lastName email role')
    .lean();
  const userMap = users.reduce((acc, user) => {
    acc[user._id.toString()] = user;
    return acc;
  }, {});

  return reminders.map((reminder) => {
    const lead = leadMap[reminder.leadId.toString()];
    const owner = userMap[reminder.userId.toString()];
    const deletedByUser = reminder.deletedBy
      ? userMap[reminder.deletedBy.toString()]
      : null;
    const leadName = lead
      ? `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.email || 'Unknown Lead'
      : 'Unknown Lead';
    const ownerName = owner
      ? `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || owner.email
      : 'Unknown User';
    const deletedByName = deletedByUser
      ? `${deletedByUser.firstName || ''} ${deletedByUser.lastName || ''}`.trim() ||
        deletedByUser.email
      : null;

    return {
      ...reminder,
      leadName,
      ownerName,
      ownerRole: owner?.role,
      deletedByName,
      deletedByRole: deletedByUser?.role,
    };
  });
};

exports.createReminder = catchAsyncErrors(async (req, res, next) => {
  const { leadId, title, description, reminderDateTime, notifyBeforeMinutes, date, time } = req.body;

  if (!leadId) {
    return next(new ErrorHandler('Lead ID is required', 400));
  }
  if (!title || !String(title).trim()) {
    return next(new ErrorHandler('Title is required', 400));
  }

  let parsedDateTime = reminderDateTime ? new Date(reminderDateTime) : null;
  if ((!parsedDateTime || Number.isNaN(parsedDateTime.getTime())) && date && time) {
    parsedDateTime = parseReminderDateTimeInUk(date, time);
  }
  if (!parsedDateTime || Number.isNaN(parsedDateTime.getTime())) {
    return next(new ErrorHandler('Valid reminder date and time are required', 400));
  }

  const Lead = await getLeadModel();
  const lead = await Lead.findOne({ _id: leadId, isDeleted: false });
  if (!lead) {
    return next(new ErrorHandler('Lead not found', 404));
  }

  const hasAccess = await canUserAccessLead(lead, req.user);
  if (!hasAccess) {
    return next(new ErrorHandler('Unauthorized: You cannot set reminders for this lead', 403));
  }

  const Reminder = await getReminderModel();
  const reminder = await Reminder.create({
    leadId,
    userId: req.user._id,
    title: String(title).trim(),
    description: description ? String(description).trim() : '',
    reminderDateTime: parsedDateTime,
    notifyBeforeMinutes:
      notifyBeforeMinutes !== undefined && notifyBeforeMinutes !== null
        ? Math.max(0, parseInt(notifyBeforeMinutes, 10) || 10)
        : 10,
    status: 'pending',
    isNotified: false,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
  });

  const [formatted] = await formatReminderList([reminder.toObject()]);

  createNotificationsForReminder(reminder.toObject(), req.user).catch((err) => {
    console.error('CRM reminder notification fan-out failed:', err);
  });

  res.status(201).json({
    success: true,
    msg: 'Reminder created successfully',
    reminder: formatted,
  });
});

exports.getReminders = catchAsyncErrors(async (req, res) => {
  const Reminder = await getReminderModel();
  const { status, filter, leadId } = req.query;

  const query = { ...buildReminderScopeQuery(req.user), isDeleted: { $ne: true } };

  if (status && ['pending', 'completed', 'dismissed'].includes(status)) {
    query.status = status;
  }

  if (leadId) {
    query.leadId = leadId;
  }

  const now = new Date();
  const { startOfToday, endOfToday } = getUkDayBounds(now);

  if (filter === 'upcoming') {
    query.status = 'pending';
    query.reminderDateTime = { $gte: now };
  } else if (filter === 'today') {
    query.reminderDateTime = { $gte: startOfToday, $lte: endOfToday };
  }

  const reminders = await Reminder.find(query).sort({ reminderDateTime: 1 }).lean();
  const formatted = await formatReminderList(reminders);

  res.status(200).json({
    success: true,
    reminders: formatted,
    total: formatted.length,
  });
});

exports.getReminderById = catchAsyncErrors(async (req, res, next) => {
  const Reminder = await getReminderModel();
  const reminder = await Reminder.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).lean();

  if (!reminder) {
    return next(new ErrorHandler('Reminder not found', 404));
  }

  if (!canUserAccessReminder(reminder, req.user)) {
    return next(new ErrorHandler('Unauthorized', 403));
  }

  const [formatted] = await formatReminderList([reminder]);

  res.status(200).json({
    success: true,
    reminder: formatted,
  });
});

exports.updateReminder = catchAsyncErrors(async (req, res, next) => {
  const Reminder = await getReminderModel();
  const reminder = await Reminder.findOne({ _id: req.params.id, isDeleted: { $ne: true } });

  if (!reminder) {
    return next(new ErrorHandler('Reminder not found', 404));
  }

  if (!canUserAccessReminder(reminder, req.user)) {
    return next(new ErrorHandler('Unauthorized', 403));
  }

  const { title, description, reminderDateTime, notifyBeforeMinutes, status, date, time } = req.body;

  if (title !== undefined) {
    const nextTitle = String(title).trim();
    if (!nextTitle) return next(new ErrorHandler('Title is required', 400));
    reminder.title = nextTitle;
  }

  if (description !== undefined) {
    reminder.description = String(description).trim();
  }

  if (reminderDateTime || (date && time)) {
    const parsed = reminderDateTime
      ? new Date(reminderDateTime)
      : parseReminderDateTimeInUk(date, time);
    if (!parsed || Number.isNaN(parsed.getTime())) {
      return next(new ErrorHandler('Valid reminder date and time are required', 400));
    }
    reminder.reminderDateTime = parsed;
    reminder.isNotified = false;
  }

  if (notifyBeforeMinutes !== undefined && notifyBeforeMinutes !== null) {
    reminder.notifyBeforeMinutes = Math.max(0, parseInt(notifyBeforeMinutes, 10) || 10);
    reminder.isNotified = false;
  }

  if (status && ['pending', 'completed', 'dismissed'].includes(status)) {
    reminder.status = status;
  }

  await reminder.save();
  const [formatted] = await formatReminderList([reminder.toObject()]);

  res.status(200).json({
    success: true,
    msg: 'Reminder updated successfully',
    reminder: formatted,
  });
});

exports.deleteReminder = catchAsyncErrors(async (req, res, next) => {
  const Reminder = await getReminderModel();
  const ReminderNotification = await getReminderNotificationModel();
  const reminder = await Reminder.findOne({ _id: req.params.id, isDeleted: { $ne: true } });

  if (!reminder) {
    return next(new ErrorHandler('Reminder not found', 404));
  }

  if (!canUserAccessReminder(reminder, req.user)) {
    return next(new ErrorHandler('Unauthorized', 403));
  }

  await ReminderNotification.updateMany(
    { reminderId: reminder._id },
    { $set: { isDismissed: true, isRead: true } }
  );

  reminder.isDeleted = true;
  reminder.deletedAt = new Date();
  reminder.deletedBy = req.user._id;
  await reminder.save();

  res.status(200).json({
    success: true,
    msg: 'Reminder moved to trash',
  });
});

exports.getTrashedReminders = catchAsyncErrors(async (req, res, next) => {
  if (req.user.role !== 'superadmin') {
    return next(new ErrorHandler('Unauthorized: Superadmin access required', 403));
  }

  const Reminder = await getReminderModel();
  const reminders = await Reminder.find({ isDeleted: true })
    .sort({ deletedAt: -1 })
    .lean();
  const formatted = await formatReminderList(reminders);

  res.status(200).json({
    success: true,
    reminders: formatted,
    total: formatted.length,
  });
});

exports.restoreReminder = catchAsyncErrors(async (req, res, next) => {
  if (req.user.role !== 'superadmin') {
    return next(new ErrorHandler('Unauthorized: Superadmin access required', 403));
  }

  const Reminder = await getReminderModel();
  const reminder = await Reminder.findOne({ _id: req.params.id, isDeleted: true });

  if (!reminder) {
    return next(new ErrorHandler('Trashed reminder not found', 404));
  }

  reminder.isDeleted = false;
  reminder.deletedAt = null;
  reminder.deletedBy = null;
  await reminder.save();

  const [formatted] = await formatReminderList([reminder.toObject()]);

  res.status(200).json({
    success: true,
    msg: 'Reminder restored successfully',
    reminder: formatted,
  });
});

exports.hardDeleteReminder = catchAsyncErrors(async (req, res, next) => {
  if (req.user.role !== 'superadmin') {
    return next(new ErrorHandler('Unauthorized: Superadmin access required', 403));
  }

  const Reminder = await getReminderModel();
  const ReminderNotification = await getReminderNotificationModel();
  const reminder = await Reminder.findOne({ _id: req.params.id, isDeleted: true });

  if (!reminder) {
    return next(new ErrorHandler('Trashed reminder not found', 404));
  }

  await ReminderNotification.deleteMany({ reminderId: reminder._id });
  await reminder.deleteOne();

  res.status(200).json({
    success: true,
    msg: 'Reminder permanently deleted',
  });
});

exports.getReminderBadgeCount = catchAsyncErrors(async (req, res) => {
  const Reminder = await getReminderModel();
  const now = new Date();
  const { startOfToday, endOfToday } = getUkDayBounds(now);

  const baseQuery = {
    ...buildReminderScopeQuery(req.user),
    status: 'pending',
    isDeleted: { $ne: true },
  };

  const [upcomingCount, todayCount] = await Promise.all([
    Reminder.countDocuments({ ...baseQuery, reminderDateTime: { $gte: now } }),
    Reminder.countDocuments({
      ...baseQuery,
      reminderDateTime: { $gte: startOfToday, $lte: endOfToday },
    }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      upcomingCount,
      todayCount,
      badgeCount: todayCount,
    },
  });
});

exports.getPendingNotifications = catchAsyncErrors(async (req, res) => {
  const ReminderNotification = await getReminderNotificationModel();
  const query = { isDismissed: false };
  if (req.user.role !== 'superadmin') {
    query.userId = req.user._id;
  }

  const notifications = await ReminderNotification.find(query)
    .sort({ notifiedAt: -1 })
    .limit(20)
    .lean();

  const Lead = await getLeadModel();
  const leadIds = [...new Set(notifications.map((n) => n.leadId.toString()))];
  const leads = await Lead.find({ _id: { $in: leadIds } }).select('firstName lastName email').lean();
  const leadMap = leads.reduce((acc, lead) => {
    acc[lead._id.toString()] = lead;
    return acc;
  }, {});

  const formatted = notifications.map((notification) => {
    const lead = leadMap[notification.leadId.toString()];
    const leadName = lead
      ? `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.email || 'Unknown Lead'
      : 'Unknown Lead';
    return { ...notification, leadName };
  });

  res.status(200).json({
    success: true,
    notifications: formatted,
  });
});

exports.dismissNotification = catchAsyncErrors(async (req, res, next) => {
  const Reminder = await getReminderModel();
  const ReminderNotification = await getReminderNotificationModel();
  const notification = await ReminderNotification.findById(req.params.id);

  if (!notification) {
    return next(new ErrorHandler('Notification not found', 404));
  }

  if (req.user.role !== 'superadmin' && notification.userId.toString() !== req.user._id.toString()) {
    return next(new ErrorHandler('Unauthorized', 403));
  }

  notification.isDismissed = true;
  notification.isRead = true;
  await notification.save();

  await Reminder.findOneAndUpdate(
    { _id: notification.reminderId, isDeleted: { $ne: true } },
    { status: 'dismissed' }
  );

  res.status(200).json({
    success: true,
    msg: 'Notification dismissed',
  });
});

exports.markNotificationRead = catchAsyncErrors(async (req, res, next) => {
  const ReminderNotification = await getReminderNotificationModel();
  const notification = await ReminderNotification.findById(req.params.id);

  if (!notification) {
    return next(new ErrorHandler('Notification not found', 404));
  }

  if (req.user.role !== 'superadmin' && notification.userId.toString() !== req.user._id.toString()) {
    return next(new ErrorHandler('Unauthorized', 403));
  }

  notification.isRead = true;
  await notification.save();

  res.status(200).json({
    success: true,
    msg: 'Notification marked as read',
  });
});

exports.processDueReminders = async () => {
  try {
    const Reminder = await getReminderModel();
    const ReminderNotification = await getReminderNotificationModel();
    const now = new Date();

    const dueReminders = await Reminder.find({
      status: 'pending',
      isNotified: false,
      isDeleted: { $ne: true },
    }).lean();

    for (const reminder of dueReminders) {
      const notifyAt = new Date(reminder.reminderDateTime);
      notifyAt.setMinutes(notifyAt.getMinutes() - (reminder.notifyBeforeMinutes || 10));

      if (now < notifyAt) continue;

      await Reminder.findByIdAndUpdate(reminder._id, { isNotified: true });

      const existingNotification = await ReminderNotification.findOne({
        reminderId: reminder._id,
        isDismissed: false,
      });

      if (existingNotification) continue;

      const notification = await ReminderNotification.create({
        reminderId: reminder._id,
        userId: reminder.userId,
        leadId: reminder.leadId,
        title: reminder.title,
        description: reminder.description,
        reminderDateTime: reminder.reminderDateTime,
        notifyBeforeMinutes: reminder.notifyBeforeMinutes,
        notifiedAt: now,
      });

      if (global.io) {
        global.io.emit('reminderNotification', {
          userId: reminder.userId.toString(),
          notification: {
            _id: notification._id,
            reminderId: notification.reminderId,
            leadId: notification.leadId,
            title: notification.title,
            description: notification.description,
            reminderDateTime: notification.reminderDateTime,
            notifyBeforeMinutes: notification.notifyBeforeMinutes,
            notifiedAt: notification.notifiedAt,
          },
        });
      }
    }
  } catch (error) {
    console.error('❌ [REMINDERS CRON] Error processing due reminders:', error);
  }
};
