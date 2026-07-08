const getCrmNotificationModel = require('../crmDB/models/crmNotificationModel');
const getLeadModel = require('../crmDB/models/leadsModel');
const User = require('../models/userModel');
const { formatReminderDateTime } = require('./reminderTimezone');

const getCrmAccessHelpers = () => require('../controllers/crmController');

const canUserAccessLead = async (lead, user) => {
  const { getCachedUserPermissions, getCachedSubadmins } = getCrmAccessHelpers();
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

const buildActivityNotificationContent = (activity, lead) => {
  const leadName =
    `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.email || 'Lead';
  const actorName = activity.createdBy?.userName || 'Someone';

  const typeLabels = {
    comment: 'New comment',
    status_change: 'Status updated',
    assignment_change: 'Lead reassigned',
    field_update: 'Lead updated',
    created: 'Lead created',
    email_sent: 'Email sent',
    call_logged: 'Call logged',
  };

  let message = '';
  switch (activity.type) {
    case 'comment':
      message = (activity.comment || '').slice(0, 200);
      break;
    case 'status_change':
      message = `Status: ${activity.changes?.oldValue || 'N/A'} → ${activity.changes?.newValue || 'N/A'}`;
      break;
    case 'assignment_change':
      message = `Agent: ${activity.changes?.oldValue || 'Unassigned'} → ${activity.changes?.newValue || 'Unassigned'}`;
      break;
    case 'field_update':
      message = activity.changes?.description || 'Lead fields were updated';
      break;
    case 'created':
      message = activity.changes?.description || 'A new lead was created';
      break;
    case 'email_sent':
      message = activity.changes?.description || activity.metadata?.subject || 'An email was sent to the lead';
      break;
    case 'call_logged':
      message = activity.changes?.description || activity.metadata?.outcome || 'A call was logged';
      break;
    default:
      message = activity.changes?.description || `${actorName} performed an action`;
  }

  return {
    title: `${typeLabels[activity.type] || 'Activity'} · ${leadName}`,
    message: message || `${actorName} updated this lead`,
    leadName,
  };
};

const resolveNotificationRecipients = async ({ lead, actorUserId, actorRole, mentions = [] }) => {
  const recipients = new Set();
  const actorId = actorUserId ? actorUserId.toString() : null;
  const superadmins = await User.find({ role: 'superadmin' }).select('_id').lean();

  // Superadmins receive every CRM notification, including their own actions and reminders
  superadmins.forEach((sa) => {
    recipients.add(sa._id.toString());
  });

  if (lead.agent) {
    recipients.add(lead.agent.toString());
  }

  if (actorRole !== 'superadmin') {
    const managingAdmins = await User.find({
      role: 'admin',
      'adminPermissions.canManageCrmLeads': true,
    })
      .select('_id')
      .lean();

    managingAdmins.forEach((admin) => {
      recipients.add(admin._id.toString());
    });
  }

  (mentions || []).forEach((mention) => {
    if (mention?.userId) {
      recipients.add(mention.userId.toString());
    }
  });

  // Actor always receives their own CRM notification when they can access the lead
  if (actorId) {
    recipients.add(actorId);
  }

  const validated = [];
  for (const recipientId of recipients) {
    const user = await User.findById(recipientId).select('_id role').lean();
    if (!user) continue;
    const hasAccess = await canUserAccessLead(lead, user);
    if (hasAccess) {
      validated.push(recipientId);
    }
  }

  return validated;
};

const emitCrmNotifications = (notifications) => {
  if (!global.io || !notifications?.length) return;

  notifications.forEach((notification) => {
    const payload = notification.toObject ? notification.toObject() : notification;
    global.io.emit('crmActivityNotification', {
      userId: payload.recipientUserId.toString(),
      notification: payload,
    });
  });
};

const persistCrmNotifications = async ({
  lead,
  actorUserId,
  actorRole,
  actorName,
  activityId = null,
  reminderId = null,
  activityType,
  title,
  message,
  leadName,
  mentions = [],
  metadata = {},
}) => {
  const recipientIds = await resolveNotificationRecipients({
    lead,
    actorUserId,
    actorRole,
    mentions,
  });

  if (!recipientIds.length) return [];

  const CrmNotification = await getCrmNotificationModel();
  const notifications = await Promise.all(
    recipientIds.map((recipientUserId) =>
      CrmNotification.create({
        recipientUserId,
        actorUserId,
        actorName,
        actorRole,
        leadId: lead._id,
        activityId: activityId || undefined,
        reminderId: reminderId || undefined,
        activityType,
        title,
        message,
        leadName,
        metadata,
      })
    )
  );

  emitCrmNotifications(notifications);
  return notifications;
};

const createNotificationsForActivity = async (activity) => {
  try {
    if (!activity?.leadId || !activity?._id) return [];

    const Lead = await getLeadModel();
    const lead = await Lead.findById(activity.leadId).lean();
    if (!lead || lead.isDeleted) return [];

    const actorUserId = activity.createdBy?.userId || null;
    const actorRole = activity.createdBy?.userRole || 'system';
    const actorName = activity.createdBy?.userName || 'System';
    const { title, message, leadName } = buildActivityNotificationContent(activity, lead);

    return persistCrmNotifications({
      lead,
      actorUserId,
      actorRole,
      actorName,
      activityId: activity._id,
      activityType: activity.type,
      title,
      message,
      leadName,
      mentions: activity.mentions || [],
      metadata: {
        changes: activity.changes || null,
      },
    });
  } catch (error) {
    console.error('Error creating CRM notifications for activity:', error);
    return [];
  }
};

const createNotificationsForReminder = async (reminder, actor) => {
  try {
    if (!reminder?.leadId || !reminder?._id || !actor?._id) return [];

    const Lead = await getLeadModel();
    const lead = await Lead.findById(reminder.leadId).lean();
    if (!lead || lead.isDeleted) return [];

    const leadName =
      `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.email || 'Lead';
    const actorName = `${actor.firstName || ''} ${actor.lastName || ''}`.trim() || actor.email || 'User';
    const scheduledFor = formatReminderDateTime(reminder.reminderDateTime);
    const description = reminder.description ? ` — ${String(reminder.description).slice(0, 120)}` : '';

    return persistCrmNotifications({
      lead,
      actorUserId: actor._id,
      actorRole: actor.role,
      actorName,
      reminderId: reminder._id,
      activityType: 'reminder_created',
      title: `Reminder set · ${leadName}`,
      message: `${reminder.title}${description}${scheduledFor ? ` (scheduled ${scheduledFor})` : ''}`,
      leadName,
      metadata: {
        reminderDateTime: reminder.reminderDateTime,
        notifyBeforeMinutes: reminder.notifyBeforeMinutes,
      },
    });
  } catch (error) {
    console.error('Error creating CRM notifications for reminder:', error);
    return [];
  }
};

module.exports = {
  canUserAccessLead,
  buildActivityNotificationContent,
  resolveNotificationRecipients,
  createNotificationsForActivity,
  createNotificationsForReminder,
};
