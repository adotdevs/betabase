import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  Stack,
  IconButton,
  Tabs,
  Tab,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Alarm,
  CheckCircle,
  Delete,
  DeleteForever,
  OpenInNew,
  Refresh,
  RestoreFromTrash,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuthUser } from 'react-auth-kit';
import Sidebar from './Sidebar';
import CrmAppBarActions from './components/CrmAppBarActions';
import {
  deleteReminderApi,
  getRemindersApi,
  getTrashedRemindersApi,
  hardDeleteReminderApi,
  restoreReminderApi,
  updateReminderApi,
} from '../../../Api/Service';
import { toast } from 'react-toastify';
import { formatReminderDateTime } from '../../../utils/reminderTimezone';

const statusColor = {
  pending: 'warning',
  completed: 'success',
  dismissed: 'default',
};

const Reminders = () => {
  const navigate = useNavigate();
  const authUser = useAuthUser();
  const isSuperAdmin = authUser()?.user?.role === 'superadmin';
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenu, setIsMobileMenu] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const isTrashTab = isSuperAdmin && tabValue === 3;

  const filterParam = useMemo(() => {
    if (tabValue === 1) return 'today';
    if (tabValue === 2) return 'upcoming';
    return 'all';
  }, [tabValue]);

  const fetchReminders = useCallback(async () => {
    try {
      setLoading(true);
      if (isTrashTab) {
        const response = await getTrashedRemindersApi();
        if (response.success) {
          setReminders(response.reminders || []);
        } else {
          toast.error(response.msg || 'Failed to load trash');
          setReminders([]);
        }
        return;
      }

      const params = { filter: filterParam };
      if (statusFilter) params.status = statusFilter;
      const response = await getRemindersApi(params);
      if (response.success) {
        setReminders(response.reminders || []);
      } else {
        toast.error(response.msg || 'Failed to load reminders');
      }
    } catch (error) {
      console.error('Failed to fetch reminders:', error);
      toast.error(isTrashTab ? 'Failed to load trash' : 'Failed to load reminders');
    } finally {
      setLoading(false);
    }
  }, [filterParam, statusFilter, isTrashTab]);

  useEffect(() => {
    if (!isSuperAdmin && tabValue === 3) {
      setTabValue(0);
      return;
    }
    fetchReminders();
  }, [fetchReminders, isSuperAdmin, tabValue]);

  const handleComplete = async (reminder) => {
    try {
      const response = await updateReminderApi(reminder._id, { status: 'completed' });
      if (response.success) {
        toast.success('Reminder marked as completed');
        fetchReminders();
      } else {
        toast.error(response.msg || 'Failed to update reminder');
      }
    } catch (error) {
      toast.error('Failed to update reminder');
    }
  };

  const handleDismiss = async (reminder) => {
    try {
      const response = await updateReminderApi(reminder._id, { status: 'dismissed' });
      if (response.success) {
        toast.success('Reminder dismissed');
        fetchReminders();
      } else {
        toast.error(response.msg || 'Failed to dismiss reminder');
      }
    } catch (error) {
      toast.error('Failed to dismiss reminder');
    }
  };

  const handleDelete = async (reminder) => {
    if (!window.confirm('Move this reminder to trash?')) return;
    try {
      setActionLoadingId(reminder._id);
      const response = await deleteReminderApi(reminder._id);
      if (response.success) {
        toast.success('Reminder moved to trash');
        fetchReminders();
      } else {
        toast.error(response.msg || 'Failed to delete reminder');
      }
    } catch (error) {
      toast.error('Failed to delete reminder');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRestore = async (reminder) => {
    try {
      setActionLoadingId(reminder._id);
      const response = await restoreReminderApi(reminder._id);
      if (response.success) {
        toast.success('Reminder restored');
        fetchReminders();
      } else {
        toast.error(response.msg || 'Failed to restore reminder');
      }
    } catch (error) {
      toast.error('Failed to restore reminder');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleHardDelete = async (reminder) => {
    if (!window.confirm('Permanently delete this reminder? This cannot be undone.')) return;
    try {
      setActionLoadingId(reminder._id);
      const response = await hardDeleteReminderApi(reminder._id);
      if (response.success) {
        toast.success('Reminder permanently deleted');
        fetchReminders();
      } else {
        toast.error(response.msg || 'Failed to permanently delete reminder');
      }
    } catch (error) {
      toast.error('Failed to permanently delete reminder');
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatDeletedAt = (value) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        setIsSidebarCollapsed={setIsSidebarCollapsed}
        mobileMenuState={isMobileMenu}
        setMobileMenuState={setIsMobileMenu}
      />

      <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar position="sticky" elevation={1} color="inherit" sx={{ bgcolor: 'background.paper' }}>
          <Toolbar>
            <Alarm sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
              Reminder Management
            </Typography>
            <IconButton onClick={fetchReminders} sx={{ mr: 1 }}>
              <Refresh />
            </IconButton>
            <CrmAppBarActions />
          </Toolbar>
        </AppBar>

        <Box sx={{ p: { xs: 2, sm: 3 }, flex: 1 }}>
          <Card elevation={2} sx={{ mb: 3, borderRadius: 3 }}>
            <CardContent>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                <Tabs value={tabValue} onChange={(e, value) => setTabValue(value)} variant="scrollable">
                  <Tab label="All Reminders" />
                  <Tab label="Today" />
                  <Tab label="Upcoming" />
                  {isSuperAdmin && <Tab label="Trash" />}
                </Tabs>
                {!isTrashTab && (
                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel>Status</InputLabel>
                    <Select
                      value={statusFilter}
                      label="Status"
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <MenuItem value="">All Statuses</MenuItem>
                      <MenuItem value="pending">Pending</MenuItem>
                      <MenuItem value="completed">Completed</MenuItem>
                      <MenuItem value="dismissed">Dismissed</MenuItem>
                    </Select>
                  </FormControl>
                )}
              </Stack>
            </CardContent>
          </Card>

          {loading ? (
            <Box display="flex" justifyContent="center" py={8}>
              <CircularProgress />
            </Box>
          ) : reminders.length === 0 ? (
            <Card elevation={1}>
              <CardContent sx={{ textAlign: 'center', py: 6 }}>
                <Alarm sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                  {isTrashTab ? 'Trash is empty' : 'No reminders found'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {isTrashTab
                    ? 'Deleted reminders will appear here for restore or permanent deletion.'
                    : 'Set reminders from a lead detail page or from the leads list expandable section.'}
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <Grid container spacing={2}>
              {reminders.map((reminder) => (
                <Grid item xs={12} md={6} lg={4} key={reminder._id}>
                  <Card elevation={2} sx={{ height: '100%', borderRadius: 2 }}>
                    <CardContent>
                      <Stack spacing={1.5}>
                        <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={1}>
                          <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 700 }}>
                            {reminder.title}
                          </Typography>
                          <Chip
                            size="small"
                            label={isTrashTab ? 'trashed' : reminder.status}
                            color={isTrashTab ? 'error' : statusColor[reminder.status] || 'default'}
                            sx={{ textTransform: 'capitalize' }}
                          />
                        </Box>

                        {reminder.description && (
                          <Typography variant="body2" color="text.secondary">
                            {reminder.description}
                          </Typography>
                        )}

                        <Typography variant="body2">
                          <strong>Lead:</strong> {reminder.leadName || 'Unknown Lead'}
                        </Typography>
                        <Typography variant="body2">
                          <strong>When:</strong> {formatReminderDateTime(reminder.reminderDateTime)}
                        </Typography>
                        {isSuperAdmin && (
                          <Typography variant="caption" color="text.secondary">
                            Owner: {reminder.ownerName || 'Unknown'} ({reminder.ownerRole || 'user'})
                          </Typography>
                        )}
                        {isTrashTab && (
                          <>
                            <Typography variant="caption" color="text.secondary" display="block">
                              Deleted: {formatDeletedAt(reminder.deletedAt)}
                            </Typography>
                            {reminder.deletedByName && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                Deleted by: {reminder.deletedByName}
                                {reminder.deletedByRole ? ` (${reminder.deletedByRole})` : ''}
                              </Typography>
                            )}
                          </>
                        )}

                        <Stack direction="row" spacing={1} flexWrap="wrap">
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<OpenInNew />}
                            onClick={() => navigate(`/admin/crm/lead/${reminder.leadId}/stream`)}
                          >
                            Open Lead
                          </Button>
                          {isTrashTab ? (
                            <>
                              <Button
                                size="small"
                                variant="contained"
                                color="success"
                                startIcon={
                                  actionLoadingId === reminder._id ? (
                                    <CircularProgress size={14} color="inherit" />
                                  ) : (
                                    <RestoreFromTrash />
                                  )
                                }
                                disabled={actionLoadingId === reminder._id}
                                onClick={() => handleRestore(reminder)}
                              >
                                Restore
                              </Button>
                              <Button
                                size="small"
                                color="error"
                                variant="outlined"
                                startIcon={
                                  actionLoadingId === reminder._id ? (
                                    <CircularProgress size={14} color="inherit" />
                                  ) : (
                                    <DeleteForever />
                                  )
                                }
                                disabled={actionLoadingId === reminder._id}
                                onClick={() => handleHardDelete(reminder)}
                              >
                                Delete Forever
                              </Button>
                            </>
                          ) : (
                            <>
                              {reminder.status === 'pending' && (
                                <>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    color="success"
                                    startIcon={<CheckCircle />}
                                    onClick={() => handleComplete(reminder)}
                                  >
                                    Complete
                                  </Button>
                                  <Button size="small" variant="outlined" onClick={() => handleDismiss(reminder)}>
                                    Dismiss
                                  </Button>
                                </>
                              )}
                              <Button
                                size="small"
                                color="error"
                                startIcon={
                                  actionLoadingId === reminder._id ? (
                                    <CircularProgress size={14} color="inherit" />
                                  ) : (
                                    <Delete />
                                  )
                                }
                                disabled={actionLoadingId === reminder._id}
                                onClick={() => handleDelete(reminder)}
                              >
                                Delete
                              </Button>
                            </>
                          )}
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default Reminders;
