const catchAsyncErrors = require('../middlewares/catchAsyncErrors');
const ErrorHandler = require('../utils/errorHandler');
const getCrmNotificationModel = require('../crmDB/models/crmNotificationModel');

const buildVisibilityQuery = (user) => ({
  recipientUserId: user._id,
});

const formatNotifications = (notifications) =>
  notifications.map((item) => ({
    ...item,
    leadId: item.leadId?._id || item.leadId,
  }));

exports.getCrmNotifications = catchAsyncErrors(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
  const skip = (pageNum - 1) * limitNum;

  const CrmNotification = await getCrmNotificationModel();
  const query = buildVisibilityQuery(req.user);

  const [notifications, total, unreadCount] = await Promise.all([
    CrmNotification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    CrmNotification.countDocuments(query),
    CrmNotification.countDocuments({ ...query, isRead: false }),
  ]);

  res.status(200).json({
    success: true,
    notifications: formatNotifications(notifications),
    unreadCount,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
});

exports.getCrmNotificationUnreadCount = catchAsyncErrors(async (req, res) => {
  const CrmNotification = await getCrmNotificationModel();
  const query = buildVisibilityQuery(req.user);
  const unreadCount = await CrmNotification.countDocuments({ ...query, isRead: false });

  res.status(200).json({
    success: true,
    unreadCount,
  });
});

exports.markCrmNotificationRead = catchAsyncErrors(async (req, res, next) => {
  const CrmNotification = await getCrmNotificationModel();
  const notification = await CrmNotification.findById(req.params.id);

  if (!notification) {
    return next(new ErrorHandler('Notification not found', 404));
  }

  if (notification.recipientUserId.toString() !== req.user._id.toString()) {
    return next(new ErrorHandler('Unauthorized', 403));
  }

  notification.isRead = true;
  await notification.save();

  res.status(200).json({
    success: true,
    msg: 'Notification marked as read',
    notification,
  });
});

exports.markAllCrmNotificationsRead = catchAsyncErrors(async (req, res) => {
  const CrmNotification = await getCrmNotificationModel();
  const query = buildVisibilityQuery(req.user);

  await CrmNotification.updateMany({ ...query, isRead: false }, { $set: { isRead: true } });

  res.status(200).json({
    success: true,
    msg: 'All notifications marked as read',
  });
});

exports.deleteCrmNotification = catchAsyncErrors(async (req, res, next) => {
  const CrmNotification = await getCrmNotificationModel();
  const notification = await CrmNotification.findById(req.params.id);

  if (!notification) {
    return next(new ErrorHandler('Notification not found', 404));
  }

  await CrmNotification.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    msg: 'Notification deleted successfully',
  });
});

exports.deleteAllCrmNotifications = catchAsyncErrors(async (req, res) => {
  const CrmNotification = await getCrmNotificationModel();
  await CrmNotification.deleteMany({});

  res.status(200).json({
    success: true,
    msg: 'All CRM notifications deleted successfully',
  });
});
