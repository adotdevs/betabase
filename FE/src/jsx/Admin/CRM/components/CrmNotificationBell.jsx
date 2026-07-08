import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Popover,
  Stack,
  Tooltip,
  Typography,
  Avatar,
  Chip,
} from '@mui/material';
import {
  NotificationsNone,
  NotificationsActive,
  Close,
  DeleteOutline,
  DoneAll,
  Comment,
  SwapHoriz,
  PersonAddAlt,
  Edit,
  Email,
  Phone,
  FiberNew,
  Alarm,
  MarkEmailRead,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuthUser } from 'react-auth-kit';
import { toast } from 'react-toastify';
import {
  deleteAllCrmNotificationsApi,
  deleteCrmNotificationApi,
  getCrmNotificationsApi,
  getCrmNotificationUnreadCountApi,
  markAllCrmNotificationsReadApi,
  markCrmNotificationReadApi,
} from '../../../../Api/Service';
import { getBackendUrl } from '../../../../config/appConfig';

const timeAgo = (dateString) => {
  if (!dateString) return '';
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString();
};

const getActivityIcon = (type) => {
  const iconProps = { fontSize: 'small' };
  switch (type) {
    case 'comment':
      return <Comment {...iconProps} />;
    case 'status_change':
      return <SwapHoriz {...iconProps} />;
    case 'assignment_change':
      return <PersonAddAlt {...iconProps} />;
    case 'field_update':
      return <Edit {...iconProps} />;
    case 'email_sent':
      return <Email {...iconProps} />;
    case 'call_logged':
      return <Phone {...iconProps} />;
    case 'created':
      return <FiberNew {...iconProps} />;
    case 'reminder_created':
      return <Alarm {...iconProps} />;
    default:
      return <NotificationsNone {...iconProps} />;
  }
};

const getActivityColor = (type) => {
  switch (type) {
    case 'comment':
      return '#42a5f5';
    case 'status_change':
      return '#ab47bc';
    case 'assignment_change':
      return '#26a69a';
    case 'field_update':
      return '#ffa726';
    case 'email_sent':
      return '#66bb6a';
    case 'call_logged':
      return '#ef5350';
    case 'created':
      return '#7e57c2';
    case 'reminder_created':
      return '#ff7043';
    default:
      return '#78909c';
  }
};

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

const CrmNotificationBell = () => {
  const navigate = useNavigate();
  const authUser = useAuthUser();
  const user = authUser()?.user;
  const currentUserId = user?._id;
  const userRole = user?.role;
  const isSuperAdmin = userRole === 'superadmin';

  const [anchorEl, setAnchorEl] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const open = Boolean(anchorEl);

  const loadUnreadCount = useCallback(async () => {
    try {
      const response = await getCrmNotificationUnreadCountApi();
      if (response.success) {
        setUnreadCount(response.unreadCount || 0);
      }
    } catch (error) {
      console.error('Failed to load CRM notification count:', error);
    }
  }, []);

  const loadNotifications = useCallback(async (pageNum = 1, append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await getCrmNotificationsApi({ page: pageNum, limit: 15 });
      if (response.success) {
        const incoming = response.notifications || [];
        setNotifications((prev) => (append ? [...prev, ...incoming] : incoming));
        setUnreadCount(response.unreadCount || 0);
        setPage(pageNum);
        setHasMore(pageNum < (response.pagination?.pages || 1));
      }
    } catch (error) {
      console.error('Failed to load CRM notifications:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUserId) return undefined;

    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 30000);

    const backendUrl = getBackendUrl();
    const socket = getSharedSocket(currentUserId, backendUrl);

    const handleCrmNotification = (payload) => {
      if (!payload?.notification) return;
      if (payload.userId && payload.userId !== currentUserId) return;

      setNotifications((prev) => {
        const exists = prev.some((item) => item._id === payload.notification._id);
        if (exists) return prev;
        return [payload.notification, ...prev].slice(0, 50);
      });
      setUnreadCount((prev) => prev + 1);
    };

    socket.off('crmActivityNotification', handleCrmNotification);
    socket.on('crmActivityNotification', handleCrmNotification);

    return () => {
      clearInterval(interval);
      socket.off('crmActivityNotification', handleCrmNotification);
    };
  }, [currentUserId, loadUnreadCount]);

  const handleOpen = (event) => {
    setAnchorEl(event.currentTarget);
    loadNotifications(1, false);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleMarkRead = async (notification, event) => {
    event?.stopPropagation();
    if (!notification?._id || notification.isRead) return;

    try {
      const response = await markCrmNotificationReadApi(notification._id);
      if (response.success) {
        setNotifications((prev) =>
          prev.map((item) =>
            item._id === notification._id ? { ...item, isRead: true } : item
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      toast.error('Failed to mark notification as read');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const response = await markAllCrmNotificationsReadApi();
      if (response.success) {
        setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
        setUnreadCount(0);
        toast.success('All notifications marked as read');
      }
    } catch (error) {
      toast.error('Failed to mark all as read');
    }
  };

  const handleDelete = async (notification, event) => {
    event?.stopPropagation();
    if (!notification?._id || !isSuperAdmin) return;

    try {
      const response = await deleteCrmNotificationApi(notification._id);
      if (response.success) {
        setNotifications((prev) => prev.filter((item) => item._id !== notification._id));
        if (!notification.isRead) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
        toast.success('Notification deleted');
      }
    } catch (error) {
      toast.error('Failed to delete notification');
    }
  };

  const handleDeleteAll = async () => {
    if (!isSuperAdmin) return;

    try {
      const response = await deleteAllCrmNotificationsApi();
      if (response.success) {
        setNotifications([]);
        setUnreadCount(0);
        toast.success('All notifications deleted');
      }
    } catch (error) {
      toast.error('Failed to delete all notifications');
    }
  };

  const handleOpenLead = async (notification) => {
    const leadId = notification?.leadId?._id || notification?.leadId;
    if (!leadId) return;

    if (!notification.isRead) {
      await handleMarkRead(notification);
    }

    handleClose();
    navigate(`/admin/crm/lead/${leadId}/stream`);
  };

  return (
    <>
      <Tooltip title="CRM Activity Notifications" arrow>
        <IconButton
          onClick={handleOpen}
          size="medium"
          sx={{
            color: 'text.primary',
            bgcolor: (theme) =>
              theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            border: 1,
            borderColor: 'divider',
            '&:hover': {
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
            },
          }}
        >
          <Badge
            badgeContent={unreadCount}
            color="error"
            max={99}
            overlap="circular"
            invisible={!unreadCount}
          >
            {unreadCount > 0 ? (
              <NotificationsActive sx={{ fontSize: 22 }} />
            ) : (
              <NotificationsNone sx={{ fontSize: 22 }} />
            )}
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              width: { xs: 'calc(100vw - 24px)', sm: 420 },
              maxWidth: 420,
              maxHeight: 'min(70vh, 560px)',
              mt: 1,
              borderRadius: 2,
              overflow: 'hidden',
              boxShadow: (theme) =>
                theme.palette.mode === 'dark'
                  ? '0 16px 48px rgba(0,0,0,0.45)'
                  : '0 16px 48px rgba(15,23,42,0.15)',
            },
          },
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            bgcolor: (theme) =>
              theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'grey.50',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Box display="flex" alignItems="center" gap={1}>
            <NotificationsActive color="primary" fontSize="small" />
            <Typography variant="subtitle1" fontWeight={700}>
              Activity
            </Typography>
            {unreadCount > 0 && (
              <Chip label={`${unreadCount} new`} size="small" color="error" sx={{ height: 22 }} />
            )}
          </Box>
          <Stack direction="row" spacing={0.5} alignItems="center">
            {unreadCount > 0 && (
              <Tooltip title="Mark all as read" arrow>
                <IconButton size="small" onClick={handleMarkAllRead}>
                  <DoneAll fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {isSuperAdmin && notifications.length > 0 && (
              <Tooltip title="Delete all (Superadmin)" arrow>
                <IconButton size="small" color="error" onClick={handleDeleteAll}>
                  <DeleteOutline fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <IconButton size="small" onClick={handleClose}>
              <Close fontSize="small" />
            </IconButton>
          </Stack>
        </Box>

        <Box sx={{ maxHeight: 'calc(min(70vh, 560px) - 64px)', overflowY: 'auto' }}>
          {loading ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress size={28} />
            </Box>
          ) : notifications.length === 0 ? (
            <Box textAlign="center" py={5} px={2}>
              <MarkEmailRead sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                All caught up
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Lead activity notifications will appear here.
              </Typography>
            </Box>
          ) : (
            <List disablePadding>
              {notifications.map((notification, index) => {
                const iconColor = getActivityColor(notification.activityType);
                return (
                  <React.Fragment key={notification._id}>
                    <ListItem
                      alignItems="flex-start"
                      onClick={() => handleOpenLead(notification)}
                      sx={{
                        cursor: 'pointer',
                        bgcolor: notification.isRead ? 'transparent' : 'action.hover',
                        '&:hover': { bgcolor: 'action.selected' },
                        py: 1.5,
                        gap: 1,
                      }}
                      secondaryAction={
                        <Stack direction="row" spacing={0.25}>
                          {!notification.isRead && (
                            <Tooltip title="Mark as read" arrow>
                              <IconButton
                                size="small"
                                onClick={(event) => handleMarkRead(notification, event)}
                              >
                                <DoneAll sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                          {isSuperAdmin && (
                            <Tooltip title="Delete" arrow>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={(event) => handleDelete(notification, event)}
                              >
                                <DeleteOutline sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      }
                    >
                      <ListItemAvatar sx={{ minWidth: 44 }}>
                        <Avatar
                          sx={{
                            width: 36,
                            height: 36,
                            bgcolor: `${iconColor}22`,
                            color: iconColor,
                          }}
                        >
                          {getActivityIcon(notification.activityType)}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Typography
                            variant="body2"
                            fontWeight={notification.isRead ? 500 : 700}
                            sx={{ pr: isSuperAdmin ? 6 : 4 }}
                          >
                            {notification.title}
                          </Typography>
                        }
                        secondary={
                          <Box component="span" display="block">
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              display="block"
                              sx={{
                                mt: 0.25,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                              }}
                            >
                              {notification.message}
                            </Typography>
                            <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 0.5 }}>
                              {notification.actorName} · {timeAgo(notification.createdAt)}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                    {index < notifications.length - 1 && <Divider component="li" />}
                  </React.Fragment>
                );
              })}
            </List>
          )}

          {hasMore && !loading && (
            <Box display="flex" justifyContent="center" py={1.5}>
              <Button
                size="small"
                disabled={loadingMore}
                onClick={() => loadNotifications(page + 1, true)}
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </Button>
            </Box>
          )}
        </Box>
      </Popover>
    </>
  );
};

export default CrmNotificationBell;
