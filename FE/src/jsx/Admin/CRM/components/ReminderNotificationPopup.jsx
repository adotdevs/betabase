import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Stack,
} from '@mui/material';
import { Close, NotificationsActive } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuthUser } from 'react-auth-kit';
import {
  dismissReminderNotificationApi,
  getPendingReminderNotificationsApi,
} from '../../../../Api/Service';
import { getBackendUrl } from '../../../../config/appConfig';
import {
  formatReminderDateTime,
  getReminderMinutesUntil,
} from '../../../../utils/reminderTimezone';

let sharedSocket = null;
let sharedSocketUserId = null;

const getSharedSocket = (userId, backendUrl) => {
  if (sharedSocket && sharedSocketUserId === userId) {
    return sharedSocket;
  }

  if (sharedSocket) {
    sharedSocket.disconnect();
    sharedSocket = null;
    sharedSocketUserId = null;
  }

  sharedSocket = io(backendUrl, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });
  sharedSocketUserId = userId;
  return sharedSocket;
};

const ReminderNotificationPopup = () => {
  const navigate = useNavigate();
  const authUser = useAuthUser();
  const [notifications, setNotifications] = useState([]);
  const dismissedIdsRef = useRef(new Set());
  const currentUserId = authUser()?.user?._id;

  const syncNotifications = useCallback((incoming) => {
    const active = (incoming || []).filter(
      (item) => item?._id && !dismissedIdsRef.current.has(item._id) && !item.isDismissed
    );

    setNotifications((prev) => {
      const map = new Map();
      [...prev, ...active].forEach((item) => {
        if (!dismissedIdsRef.current.has(item._id) && !item.isDismissed) {
          map.set(item._id, item);
        }
      });
      return Array.from(map.values()).sort(
        (a, b) => new Date(a.reminderDateTime) - new Date(b.reminderDateTime)
      );
    });
  }, []);

  const loadPendingNotifications = useCallback(async () => {
    try {
      const response = await getPendingReminderNotificationsApi();
      if (response.success) {
        syncNotifications(response.notifications || []);
      }
    } catch (error) {
      console.error('Failed to load reminder notifications:', error);
    }
  }, [syncNotifications]);

  useEffect(() => {
    if (!currentUserId) return undefined;

    loadPendingNotifications();
    const interval = setInterval(loadPendingNotifications, 30000);

    const backendUrl = getBackendUrl();
    const socket = getSharedSocket(currentUserId, backendUrl);

    const handleReminderNotification = (payload) => {
      if (!payload?.notification) return;
      if (payload.userId && payload.userId !== currentUserId) return;
      syncNotifications([payload.notification]);
    };

    socket.off('reminderNotification', handleReminderNotification);
    socket.on('reminderNotification', handleReminderNotification);

    return () => {
      clearInterval(interval);
      socket.off('reminderNotification', handleReminderNotification);
    };
  }, [currentUserId, loadPendingNotifications, syncNotifications]);

  const handleDismiss = async (notification) => {
    if (!notification?._id) return;

    dismissedIdsRef.current.add(notification._id);
    setNotifications((prev) => prev.filter((item) => item._id !== notification._id));

    try {
      await dismissReminderNotificationApi(notification._id);
    } catch (error) {
      console.error('Dismiss reminder notification error:', error);
    }
  };

  const handleOpenLead = (notification) => {
    const leadId = notification?.leadId?._id || notification?.leadId;
    if (leadId) {
      navigate(`/admin/crm/lead/${leadId}/stream`);
    }
  };

  if (!notifications.length) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        right: { xs: 12, sm: 24 },
        bottom: { xs: 12, sm: 24 },
        zIndex: 9999,
        width: { xs: 'calc(100% - 24px)', sm: 380 },
        maxHeight: 'calc(100vh - 48px)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        pointerEvents: 'none',
      }}
    >
      {notifications.map((notification) => {
        const minutesUntil = getReminderMinutesUntil(notification.reminderDateTime);

        return (
          <Paper
            key={notification._id}
            elevation={12}
            sx={{
              p: 2,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'warning.main',
              bgcolor: 'background.paper',
              pointerEvents: 'auto',
              animation: 'reminderPulse 2s ease-in-out infinite',
              '@keyframes reminderPulse': {
                '0%, 100%': { boxShadow: '0 8px 24px rgba(255, 152, 0, 0.25)' },
                '50%': { boxShadow: '0 12px 32px rgba(255, 152, 0, 0.45)' },
              },
            }}
          >
            <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
              <Box display="flex" alignItems="center" gap={1}>
                <NotificationsActive color="warning" />
                <Typography variant="subtitle1" fontWeight={700}>
                  Reminder
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => handleDismiss(notification)}>
                <Close fontSize="small" />
              </IconButton>
            </Box>

            <Typography variant="body1" fontWeight={600} sx={{ mb: 0.5 }}>
              {notification.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Follow up with {notification.leadName || 'lead'}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
              {minutesUntil <= 0
                ? `Scheduled for ${formatReminderDateTime(notification.reminderDateTime)}`
                : `Starts in ${minutesUntil} minute${minutesUntil === 1 ? '' : 's'}`}
            </Typography>

            <Stack direction="row" spacing={1}>
              <Button variant="contained" size="small" onClick={() => handleOpenLead(notification)}>
                Open Lead
              </Button>
              <Button variant="outlined" size="small" onClick={() => handleDismiss(notification)}>
                Dismiss
              </Button>
            </Stack>
          </Paper>
        );
      })}
    </Box>
  );
};

export default ReminderNotificationPopup;
