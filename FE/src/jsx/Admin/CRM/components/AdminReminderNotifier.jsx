import React from 'react';
import { useAuthUser } from 'react-auth-kit';
import ReminderNotificationPopup from './ReminderNotificationPopup';

const ADMIN_ROLES = new Set(['superadmin', 'admin', 'subadmin']);

const AdminReminderNotifier = () => {
  const authUser = useAuthUser();
  const role = authUser()?.user?.role;

  if (!role || !ADMIN_ROLES.has(role)) {
    return null;
  }

  return <ReminderNotificationPopup />;
};

export default AdminReminderNotifier;
